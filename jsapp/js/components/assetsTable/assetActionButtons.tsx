/**
 * This is intended to be displayed in multiple places:
 * - library asset landing page
 * - library listing row
 * - project landing page (see: https://github.com/form-case/kpi/issues/2758)
 * - projects listing row (see: https://github.com/form-case/kpi/issues/2758)
 */

import React from 'react';
import autoBind from 'react-autobind';
import debounce from 'lodash.debounce';
import PopoverMenu from 'js/popoverMenu';
import bem, {makeBem} from 'js/bem';
import {actions} from 'js/actions';
import assetUtils from 'js/assetUtils';
import {ASSET_TYPES, ACCESS_TYPES} from 'js/constants';
import {ROUTES} from 'js/router/routerConstants';
import mixins from 'js/mixins';
import type {AssetResponse, AssetDownloads} from 'js/dataInterface';
import {
  isAnyLibraryItemRoute,
  getRouteAssetUid,
  isAnyFormRoute,
} from 'js/router/routerUtils';
import managedCollectionsStore from 'js/components/library/managedCollectionsStore';
import type {ManagedCollectionsStoreData} from 'js/components/library/managedCollectionsStore';
import './assetActionButtons.scss';
import {withRouter} from 'jsapp/js/router/legacy';
import type {WithRouterProps} from 'jsapp/js/router/legacy';
import {
  archiveAsset,
  deleteAsset,
  unarchiveAsset,
  cloneAsset,
  cloneAssetAsSurvey,
  cloneAssetAsTemplate,
  manageAssetSharing,
  replaceAssetForm,
  modifyAssetTags,
  manageAssetLanguages,
  manageAssetSettings
} from 'jsapp/js/assetQuickActions';
import {userCan} from 'js/components/permissions/utils';

bem.AssetActionButtons = makeBem(null, 'asset-action-buttons', 'menu');
bem.AssetActionButtons__button = makeBem(bem.AssetActionButtons, 'button', 'a');
bem.AssetActionButtons__iconButton = makeBem(
  bem.AssetActionButtons,
  'icon-button',
  'a'
);

interface AssetActionButtonsProps extends WithRouterProps {
  asset: AssetResponse;
  has_deployment?: boolean;
  deployment__active?: boolean;
}

interface AssetActionButtonsState {
  managedCollections: AssetResponse[];
  shouldHidePopover: boolean;
  isPopoverVisible: boolean;
  isSubscribePending: boolean;
}

class AssetActionButtons extends React.Component<
  AssetActionButtonsProps,
  AssetActionButtonsState
> {
  private unlisteners: Function[] = [];
  hidePopoverDebounced = debounce(() => {
    if (this.state.isPopoverVisible) {
      this.setState({shouldHidePopover: true});
    }
  }, 500);

  constructor(props: AssetActionButtonsProps) {
    super(props);
    this.state = {
      managedCollections: managedCollectionsStore.data.collections,
      shouldHidePopover: false,
      isPopoverVisible: false,
      isSubscribePending: false,
    };
    autoBind(this);
  }

  componentDidMount() {
    managedCollectionsStore.listen(
      this.onManagedCollectionsStoreChanged.bind(this),
      this
    );
    this.unlisteners.push(
      actions.library.subscribeToCollection.completed.listen(
        this.onSubscribingCompleted.bind(this)
      ),
      actions.library.unsubscribeFromCollection.completed.listen(
        this.onSubscribingCompleted.bind(this)
      )
    );
  }

  componentWillUnmount() {
    this.unlisteners.forEach((clb) => {
      clb();
    });
  }

  onSubscribingCompleted() {
    this.setState({isSubscribePending: false});
  }

  onManagedCollectionsStoreChanged(storeData: ManagedCollectionsStoreData) {
    this.setState({managedCollections: storeData.collections});
  }

  // methods for inner workings of component

  /**
   * Allow for some time for user to go back to the popover menu.
   * Then force hide popover in next render cycle (PopoverMenu interface
   * handles it this way)
   */
  onMouseLeave() {
    this.hidePopoverDebounced();
  }

  onMouseEnter() {
    this.hidePopoverDebounced.cancel();
  }

  onPopoverSetVisible() {
    this.setState({isPopoverVisible: true});
  }

  // Methods for managing the asset

  modifyDetails() {
    manageAssetSettings(this.props.asset);
  }

  editLanguages() {
    manageAssetLanguages(this.props.asset.uid);
  }

  share() {
    manageAssetSharing(this.props.asset.uid);
  }

  showTagsModal() {
    modifyAssetTags(this.props.asset);
  }

  replace() {
    replaceAssetForm(this.props.asset);
  }

  delete() {
    deleteAsset(
      this.props.asset,
      assetUtils.getAssetDisplayName(this.props.asset).final,
      this.onDeleteComplete.bind(this, this.props.asset.uid)
    );
  }

  /**
   * Navigates out of nonexistent paths after asset was successfully deleted
   */
  onDeleteComplete(assetUid: string) {
    if (isAnyLibraryItemRoute() && getRouteAssetUid() === assetUid) {
      this.props.router.navigate(ROUTES.LIBRARY);
    }
    if (isAnyFormRoute() && getRouteAssetUid() === assetUid) {
      this.props.router.navigate(ROUTES.FORMS);
    }
  }

  deploy() {
    mixins.dmix.deployAsset(this.props.asset);
  }

  archive() {
    archiveAsset(this.props.asset);
  }

  unarchive() {
    unarchiveAsset(this.props.asset);
  }

  clone() {
    cloneAsset(this.props.asset);
  }

  cloneAsSurvey() {
    cloneAssetAsSurvey(
      this.props.asset.uid,
      assetUtils.getAssetDisplayName(this.props.asset).final
    );
  }

  cloneAsTemplate() {
    cloneAssetAsTemplate(
      this.props.asset.uid,
      assetUtils.getAssetDisplayName(this.props.asset).final
    );
  }

  /** Pass `null` to remove from collection. */
  moveToCollection(collectionUrl: string | null) {
    actions.library.moveToCollection(this.props.asset.uid, collectionUrl);
  }

  subscribeToCollection() {
    this.setState({isSubscribePending: true});
    actions.library.subscribeToCollection(this.props.asset.url);
  }

  unsubscribeFromCollection() {
    this.setState({isSubscribePending: true});
    actions.library.unsubscribeFromCollection(this.props.asset.uid);
  }

  viewContainingCollection() {
    if (this.props.asset.parent === null) {
      return;
    }
    const parentArr = this.props.asset.parent.split('/');
    const parentAssetUid = parentArr[parentArr.length - 2];
    this.props.router.navigate(
      ROUTES.LIBRARY_ITEM.replace(':uid', parentAssetUid)
    );
  }

  getFormBuilderLink() {
    let link =
      '#' + ROUTES.EDIT_LIBRARY_ITEM.replace(':uid', this.props.asset.uid);

    // when editing a child from within a collection page
    // make sure the "Return to list" button goes back to collection
    const currentAssetUid = getRouteAssetUid();
    if (
      this.props.asset.asset_type !== ASSET_TYPES.collection.id &&
      this.props.asset.parent !== null &&
      currentAssetUid !== null &&
      this.props.asset.parent.includes(currentAssetUid)
    ) {
      const backPath = ROUTES.LIBRARY_ITEM.replace(':uid', currentAssetUid);
      link += `?back=${backPath}`;
    }

    return link;
  }

  renderMoreActionsTrigger() {
    const assetType = this.props.asset.asset_type;
    const userCanDelete = userCan('delete_submissions', this.props.asset);

    if (assetType === ASSET_TYPES.collection.id && !userCanDelete) {
      return null;
    }

    return (
      <div className='right-tooltip' data-tip={t('More actions')}>
        <i className='k-icon k-icon-more' />
      </div>
    );
  }

  renderMoreActions() {
    const assetType = this.props.asset.asset_type;
    let downloads: AssetDownloads = [];
    if (assetType !== ASSET_TYPES.collection.id) {
      downloads = this.props.asset.downloads;
    }
    const userCanEdit = userCan('change_asset', this.props.asset);
    const userCanDelete = userCan('delete_submissions', this.props.asset);
    const isDeployable =
      assetType === ASSET_TYPES.survey.id &&
      this.props.asset.deployed_version_id === null;

    // avoid rendering empty menu
    if (!userCanEdit && downloads.length === 0) {
      return null;
    }

    return (
      <PopoverMenu
        triggerLabel={this.renderMoreActionsTrigger()}
        clearPopover={this.state.shouldHidePopover}
        popoverSetVisible={this.onPopoverSetVisible}
      >
        {userCanEdit && isDeployable && (
          <bem.PopoverMenu__link onClick={this.deploy}>
            <i className='k-icon k-icon-deploy' />
            {t('Deploy')}
          </bem.PopoverMenu__link>
        )}

        {userCanEdit && assetType === ASSET_TYPES.survey.id && (
          <bem.PopoverMenu__link onClick={this.replace}>
            <i className='k-icon k-icon-replace' />
            {t('Replace form')}
          </bem.PopoverMenu__link>
        )}

        {userCanEdit && assetType !== ASSET_TYPES.collection.id && (
          <bem.PopoverMenu__link onClick={this.editLanguages}>
            <i className='k-icon k-icon-language' />
            {t('Manage translations')}
          </bem.PopoverMenu__link>
        )}

        {userCanEdit && assetType === ASSET_TYPES.survey.id && (
          <bem.PopoverMenu__link onClick={this.cloneAsTemplate}>
            <i className='k-icon k-icon-template' />
            {t('Create template')}
          </bem.PopoverMenu__link>
        )}

        {downloads.map((dl) => (
          <bem.PopoverMenu__link href={dl.url} key={`dl-${dl.format}`}>
            <i className={`k-icon k-icon-file-${dl.format}`} />
            {t('Download')}&nbsp;{dl.format.toString().toUpperCase()}
          </bem.PopoverMenu__link>
        ))}

        {userCanEdit &&
          assetType !== ASSET_TYPES.survey.id &&
          assetType !== ASSET_TYPES.collection.id &&
          this.props.asset.parent !== null && (
            <bem.PopoverMenu__link
              onClick={this.moveToCollection.bind(this, null)}
            >
              <i className='k-icon k-icon-folder-out' />
              {t('Remove from collection')}
            </bem.PopoverMenu__link>
          )}

        {userCanEdit &&
          assetType !== ASSET_TYPES.survey.id &&
          assetType !== ASSET_TYPES.collection.id &&
          this.state.managedCollections.length > 0 && [
            <bem.PopoverMenu__heading key='heading'>
              {t('Move to')}
            </bem.PopoverMenu__heading>,
            <bem.PopoverMenu__moveTo key='list'>
              {this.state.managedCollections.map((collection) => {
                const modifiers = ['move-coll-item'];
                const isAssetParent =
                  collection.url === this.props.asset.parent;
                if (isAssetParent) {
                  modifiers.push('move-coll-item-parent');
                }
                const displayName =
                  assetUtils.getAssetDisplayName(collection).final;
                return (
                  <bem.PopoverMenu__item
                    onClick={this.moveToCollection.bind(this, collection.url)}
                    key={collection.uid}
                    title={displayName}
                    m={modifiers}
                  >
                    {isAssetParent && <i className='k-icon k-icon-check' />}
                    {!isAssetParent && (
                      <i className='k-icon k-icon-folder-in' />
                    )}
                    {displayName}
                  </bem.PopoverMenu__item>
                );
              })}
            </bem.PopoverMenu__moveTo>,
          ]}

        {userCanEdit &&
          assetType === ASSET_TYPES.survey.id &&
          this.props.has_deployment &&
          !this.props.deployment__active && (
            <bem.PopoverMenu__link onClick={this.unarchive}>
              <i className='k-icon k-icon-archived' />
              {t('Unarchive')}
            </bem.PopoverMenu__link>
          )}

        {userCanEdit &&
          assetType === ASSET_TYPES.survey.id &&
          this.props.has_deployment &&
          this.props.deployment__active && (
            <bem.PopoverMenu__link onClick={this.archive}>
              <i className='k-icon k-icon-archived' />
              {t('Archive')}
            </bem.PopoverMenu__link>
          )}

        {userCanEdit && userCanDelete && (
          <bem.PopoverMenu__link onClick={this.delete}>
            <i className='k-icon k-icon-trash' />
            {t('Delete')}
          </bem.PopoverMenu__link>
        )}
      </PopoverMenu>
    );
  }

  renderSubButton() {
    const isSelfOwned = assetUtils.isSelfOwned(this.props.asset);
    const isPublic = assetUtils.isAssetPublic(this.props.asset.permissions);
    const isUserSubscribed =
      this.props.asset.access_types &&
      this.props.asset.access_types.includes(ACCESS_TYPES.subscribed);

    if (
      !isSelfOwned &&
      isPublic &&
      this.props.asset.asset_type === ASSET_TYPES.collection.id
    ) {
      const modifiers = isUserSubscribed ? ['off'] : ['on'];
      const fn = isUserSubscribed
        ? this.unsubscribeFromCollection.bind(this)
        : this.subscribeToCollection.bind(this);
      if (this.state.isSubscribePending) {
        modifiers.push('pending');
      }
      let icon = null;
      let title = t('Pending…');
      if (!this.state.isSubscribePending) {
        if (isUserSubscribed) {
          icon = <i className='k-icon k-icon-close' />;
          title = t('Unsubscribe');
        } else {
          icon = <i className='k-icon k-icon-subscribe' />;
          title = t('Subscribe');
        }
      }

      return (
        <bem.AssetActionButtons__button
          m={modifiers}
          onClick={fn}
          disabled={this.state.isSubscribePending}
        >
          {icon}
          {title}
        </bem.AssetActionButtons__button>
      );
    }

    return null;
  }

  render() {
    if (!this.props.asset) {
      return null;
    }

    const assetType = this.props.asset.asset_type;
    const userCanEdit = userCan('change_asset', this.props.asset);
    const hasDetailsEditable =
      assetType === ASSET_TYPES.template.id ||
      assetType === ASSET_TYPES.collection.id;

    const routeAssetUid = getRouteAssetUid();

    return (
      <bem.AssetActionButtons
        onMouseLeave={this.onMouseLeave}
        onMouseEnter={this.onMouseEnter}
      >
        {this.renderSubButton()}

        {userCanEdit && assetType !== ASSET_TYPES.collection.id && (
          <bem.AssetActionButtons__iconButton
            href={this.getFormBuilderLink()}
            data-tip={t('Edit in Form Builder')}
            className='right-tooltip'
          >
            <i className='k-icon k-icon-edit' />
          </bem.AssetActionButtons__iconButton>
        )}

        {userCanEdit && hasDetailsEditable && (
          <bem.AssetActionButtons__iconButton
            onClick={this.modifyDetails}
            data-tip={t('Modify details')}
            className='right-tooltip'
          >
            <i className='k-icon k-icon-settings' />
          </bem.AssetActionButtons__iconButton>
        )}

        {userCanEdit && (
          <bem.AssetActionButtons__iconButton
            onClick={this.showTagsModal}
            data-tip={t('Edit Tags')}
            className='right-tooltip'
          >
            <i className='k-icon k-icon-tag' />
          </bem.AssetActionButtons__iconButton>
        )}

        {userCanEdit && (
          <bem.AssetActionButtons__iconButton
            onClick={this.share}
            data-tip={t('Share')}
            className='right-tooltip'
          >
            <i className='k-icon k-icon-user-share' />
          </bem.AssetActionButtons__iconButton>
        )}

        {assetType !== ASSET_TYPES.collection.id && (
          <bem.AssetActionButtons__iconButton
            onClick={this.clone}
            data-tip={t('Clone')}
            className='right-tooltip'
          >
            <i className='k-icon k-icon-duplicate' />
          </bem.AssetActionButtons__iconButton>
        )}

        {assetType === ASSET_TYPES.template.id && (
          <bem.AssetActionButtons__iconButton
            onClick={this.cloneAsSurvey}
            data-tip={t('Create project')}
            className='right-tooltip'
          >
            <i className='k-icon k-icon-projects' />
          </bem.AssetActionButtons__iconButton>
        )}

        {routeAssetUid &&
          this.props.asset.parent !== null &&
          !this.props.asset.parent.includes(routeAssetUid) && (
            <bem.AssetActionButtons__iconButton
              onClick={this.viewContainingCollection}
              data-tip={t('View containing Collection')}
              className='right-tooltip'
            >
              <i className='k-icon k-icon-folder' />
            </bem.AssetActionButtons__iconButton>
          )}

        {this.renderMoreActions()}
      </bem.AssetActionButtons>
    );
  }
}

export default withRouter(AssetActionButtons);
