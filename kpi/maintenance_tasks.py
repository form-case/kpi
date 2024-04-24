import constance
from datetime import timedelta

from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from kpi.models import AssetSnapshot


def remove_old_asset_snapshots():
    days = constance.config.ASSET_SNAPSHOT_DAYS_RETENTION

    # We don't want to delete an asset's latest versioned snapshot,
    # even if it is older than the retention period
    newer_snapshot_for_asset = AssetSnapshot.objects.exclude(
        asset_version=None
    ).filter(asset_id=OuterRef('asset_id'), pk__gt=OuterRef('pk'))

    delete_queryset = AssetSnapshot.objects.filter(
        date_created__lt=timezone.now() - timedelta(days=days),
    ).filter(Exists(newer_snapshot_for_asset) | Q(asset_version=None))

    while True:
        count, _ = delete_queryset.filter(
            pk__in=delete_queryset[:1000]
        ).delete()
        if not count:
            break
