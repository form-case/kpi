# coding: utf-8
from constance import config
from django.conf import settings
from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import (
    UserCreationForm as DjangoUserCreationForm,
    UserChangeForm as DjangoUserChangeForm,
)
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db.models import Count, Sum, Q
from django.forms import CharField
from django.urls import reverse
from django.utils import timezone
from django.utils.safestring import mark_safe

from kobo.apps.accounts.validators import (
    USERNAME_MAX_LENGTH,
    USERNAME_INVALID_MESSAGE,
    username_validators,
)
from kobo.apps.trash_bin.exceptions import TrashIntegrityError
from kobo.apps.trash_bin.models.account import AccountTrash
from kobo.apps.trash_bin.utils import move_to_trash
from kpi.deployment_backends.kc_access.shadow_models import (
    ReadOnlyKobocatMonthlyXFormSubmissionCounter,
)
from kpi.exceptions import (
    QueryParserBadSyntax,
    QueryParserNotSupportedFieldLookup,
    SearchQueryTooShortException,
)
from kpi.filters import SearchFilter
from .models import (
    ExtraUserDetail,
    ConfigurationFile,
    SitewideMessage,
    PerUserSetting,
)


class QueryParserFilter(admin.filters.SimpleListFilter):

    title = 'Advanced search'
    template = 'admin/query_parser_filter.html'
    parameter_name = 'q'

    def lookups(self, request, model_admin):
        return (),

    def queryset(self, request, queryset):
        return None

    def choices(self, changelist):
        return (),


class UserChangeForm(DjangoUserChangeForm):

    username = CharField(
        label='username',
        max_length=USERNAME_MAX_LENGTH,
        help_text=USERNAME_INVALID_MESSAGE,
        validators=username_validators,
    )

    def clean(self):
        cleaned_data = super().clean()
        is_active = cleaned_data['is_active']
        if (
            is_active
            and AccountTrash.objects.filter(user_id=self.instance.pk).exists()
        ):
            url = reverse('admin:trash_bin_accounttrash_changelist')
            raise ValidationError(mark_safe(
                f'User is in <a href="{url}">trash</a> and cannot be reactivated'
                f' from here.'
            ))

        return cleaned_data


class UserCreationForm(DjangoUserCreationForm):

    username = CharField(
        label='username',
        max_length=USERNAME_MAX_LENGTH,
        help_text=USERNAME_INVALID_MESSAGE,
        validators=username_validators,
    )


class ExtendedUserAdmin(UserAdmin):
    """
    Deleting users used to a two-step process since KPI and KoBoCAT
    shared the same database, but it's not the case anymore.
    See https://github.com/kobotoolbox/kobocat/issues/92#issuecomment-158219885

    It still implies to delete records in both databases. If users are
    deleted in KPI database but not in KoboCAT database, they will receive a
    500 error if they try to recreate an account with a previously deleted
    username.

    First, all KPI objects related to the user should be removed.
    Then, KoBoCAT objects related to the user (in KoBoCAT database) except
    `XForm` and `Instance`. We do not want to delete data without owner's
    permission
    """

    form = UserChangeForm
    add_form = UserCreationForm
    change_form_template = 'admin/loginas/change_form.html'
    list_display = (
        'username',
        'email',
        'is_active',
        'date_joined',
        'get_date_deactivated',
    )
    list_filter = (QueryParserFilter, 'is_active', 'is_superuser', 'date_joined')
    search_default_field_lookups = [
        'username__icontains',
        'email__icontains',
        'first_name__icontains',
        'last_name__icontains',
    ]
    readonly_fields = UserAdmin.readonly_fields + (
        'deployed_forms_count',
        'monthly_submission_count',
    )
    fieldsets = UserAdmin.fieldsets + (
        (
            'Deployed forms and Submissions Counts',
            {'fields': ('deployed_forms_count', 'monthly_submission_count')},
        ),
    )
    actions = ['remove', 'delete']

    @admin.action(description='Remove selected users (delete everything but their username)')
    def remove(self, request, queryset, **kwargs):
        """
        Put users in trash and schedule their data deletion according to
        constance setting `ACCOUNT_TRASH_GRACE_PERIOD`. Keep only their
        username.
        """
        if not request.user.is_superuser:
            return

        users = list(queryset.values('pk', 'username'))
        self._delete_or_purge(
            request, users=users, grace_period=config.ACCOUNT_TRASH_GRACE_PERIOD
        )

    @admin.action(description='Delete selected users (keep nothing)')
    def delete(self, request, queryset, **kwargs):
        """
        Put users in trash and schedule their account deletion according to
        constance setting `ACCOUNT_TRASH_GRACE_PERIOD`. Remove everything.
        """
        if not request.user.is_superuser:
            return

        users = list(queryset.values('pk', 'username'))
        self._delete_or_purge(
            request, users=users, grace_period=0, delete_all=True
        )

    def deployed_forms_count(self, obj):
        """
        Gets the count of deployed forms to be displayed on the
        Django admin user changelist page
        """
        assets_count = obj.assets.filter(
            _deployment_data__active=True
        ).aggregate(count=Count('pk'))
        return assets_count['count']

    @admin.display(description='Deactivated date')
    def get_date_deactivated(self, obj):
        if not (date_deactivated := obj.extra_details.date_deactivated):
            return '-'

        return date_deactivated

    def get_queryset(self, request):
        queryset = super().get_queryset(request)
        return queryset.exclude(
            Q(pk__in=AccountTrash.objects.values_list('user_id', flat=True))
            | Q(pk=settings.ANONYMOUS_USER_ID),
        ).select_related('extra_details')

    def get_search_results(self, request, queryset, search_term):

        if request.path != '/admin/auth/user/':
            return super().get_search_results(request, queryset, search_term)

        class _ViewAdminView:
            search_default_field_lookups = self.search_default_field_lookups

        use_distinct = True
        try:
            queryset = SearchFilter().filter_queryset(
                request, queryset, view=_ViewAdminView
            )
        except (
            QueryParserBadSyntax,
            QueryParserNotSupportedFieldLookup,
            SearchQueryTooShortException,
        ) as e:
            self.message_user(
                request,
                str(e),
                messages.ERROR,
            )
            return queryset.model.objects.none(), use_distinct

        return queryset, use_distinct

    def has_delete_permission(self, request, obj=None):
        # Override django admin built-in delete
        return False

    def monthly_submission_count(self, obj):
        """
        Gets the number of this month's submissions a user has to be
        displayed in the Django admin user changelist page
        """
        today = timezone.now().date()
        instances = ReadOnlyKobocatMonthlyXFormSubmissionCounter.objects.filter(
            user_id=obj.id,
            year=today.year,
            month=today.month,
        ).aggregate(
            counter=Sum('counter')
        )
        return instances.get('counter')

    def _delete_or_purge(
        self,
        request,
        grace_period: int,
        users: list[dict],
        delete_all: bool = False,
    ):
        try:
            move_to_trash(request.user, users, grace_period, 'user', delete_all)
        except TrashIntegrityError:
            self.message_user(
                request,
                'One or several users are already in trash',
                messages.ERROR,
            )
            return

        AccountTrash.toggle_user_statuses(users, active=False)

        self.message_user(
            request,
            self._get_message(len(users) == 1, grace_period),
            messages.SUCCESS,
        )

    def _get_message(self, singular: bool, grace_period: int) -> str:

        url = reverse('admin:trash_bin_accounttrash_changelist')

        if grace_period == -1:
            message = (
                'User has been archived.'
                if singular
                else 'Users have been archived.'
            )
            message += (
                f' Their data is in <a href="{url}">trash</a> and must be '
                f'emptied manually.'
            )
        elif grace_period:
            message = (
                'User has been archived '
                if singular
                else 'Users have been archived '
            )
            message += (
                f' and their data deletion is scheduled for {grace_period} days'
                f' from now. View <a href="{url}">trash.</a>'
            )
        else:
            message = (
                'User deletion is in progress. '
                if singular
                else 'Users deletion is in progress. '
            )
            message += f'View <a href="{url}">trash.</a>'

        return mark_safe(message)


class ExtraUserDetailAdmin(admin.ModelAdmin):
    list_display = ('user',)
    ordering = ('user__username',)
    search_fields = ('user__username',)
    autocomplete_fields = ['user']

    def get_queryset(self, request):
        return (
            super().get_queryset(request).exclude(user_id=settings.ANONYMOUS_USER_ID)
        )


admin.site.register(ExtraUserDetail, ExtraUserDetailAdmin)
admin.site.register(SitewideMessage)
admin.site.register(ConfigurationFile)
admin.site.register(PerUserSetting)
admin.site.unregister(User)
admin.site.register(User, ExtendedUserAdmin)
