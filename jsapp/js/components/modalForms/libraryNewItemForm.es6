import React from 'react';
import reactMixin from 'react-mixin';
import autoBind from 'react-autobind';
import Reflux from 'reflux';
import PropTypes from 'prop-types';
import bem from 'js/bem';
import LoadingSpinner from 'js/components/common/loadingSpinner';
import {stores} from 'js/stores';
import sessionStore from 'js/stores/session';
import {
  MODAL_TYPES,
  ASSET_TYPES,
} from 'js/constants';
import {ROUTES} from 'js/router/routerConstants';
import mixins from 'js/mixins';
import managedCollectionsStore from 'js/components/library/managedCollectionsStore';
import {withRouter} from 'js/router/legacy';
import {when} from 'mobx';

class LibraryNewItemForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isSessionLoaded: !!sessionStore.isLoggedIn,
    };

    autoBind(this);
  }

  componentDidMount() {
    when(() => sessionStore.isInitialLoadComplete, () => {
      this.setState({isSessionLoaded: true});
    });
  }

  goToAssetCreator() {
    stores.pageState.hideModal();

    let targetPath = ROUTES.NEW_LIBRARY_ITEM;
    if (this.isLibrarySingle()) {
      const found = managedCollectionsStore.find(this.currentAssetID());
      if (found && found.asset_type === ASSET_TYPES.collection.id) {
        // when creating from within a collection page, make the new asset
        // a child of this collection
        targetPath = ROUTES.NEW_LIBRARY_CHILD.replace(':uid', found.uid);
      }
    }

    this.props.router.navigate(targetPath);
  }

  goToCollection() {
    stores.pageState.switchModal({
      type: MODAL_TYPES.LIBRARY_COLLECTION,
      previousType: MODAL_TYPES.LIBRARY_NEW_ITEM
    });
  }

  goToTemplate() {
    stores.pageState.switchModal({
      type: MODAL_TYPES.LIBRARY_TEMPLATE,
      previousType: MODAL_TYPES.LIBRARY_NEW_ITEM
    });
  }

  goToUpload() {
    stores.pageState.switchModal({
      type: MODAL_TYPES.LIBRARY_UPLOAD,
      previousType: MODAL_TYPES.LIBRARY_NEW_ITEM
    });
  }

  render() {
    if (!this.state.isSessionLoaded) {
      return (<LoadingSpinner/>);
    }

    return (
      <bem.FormModal__form className='project-settings project-settings--form-source'>
        <bem.FormModal__item m='form-source-buttons'>
          <button onClick={this.goToAssetCreator}>
            <i className='k-icon k-icon-block' />
            {t('Question Block')}
          </button>

          <button onClick={this.goToTemplate}>
            <i className='k-icon k-icon-template' />
            {t('Template')}
          </button>

          <button onClick={this.goToUpload}>
            <i className='k-icon k-icon-upload' />
            {t('Upload')}
          </button>

          <button onClick={this.goToCollection}>
            <i className='k-icon k-icon-folder' />
            {t('Collection')}
          </button>
        </bem.FormModal__item>
      </bem.FormModal__form>
    );
  }
}

reactMixin(LibraryNewItemForm.prototype, Reflux.ListenerMixin);
reactMixin(LibraryNewItemForm.prototype, mixins.contextRouter);

LibraryNewItemForm.contextTypes = {
  router: PropTypes.object
};

export default withRouter(LibraryNewItemForm);
