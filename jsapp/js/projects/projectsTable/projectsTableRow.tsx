import React from 'react';
import {useNavigate} from 'react-router-dom';
import {ROUTES} from 'js/router/routerConstants';
import {PROJECT_FIELDS} from 'js/projects/projectsView/projectsViewConstants';
import type {ProjectFieldName, ProjectFieldDefinition} from 'js/projects/projectsView/projectsViewConstants';
import Checkbox from 'js/components/common/checkbox';
import Badge from 'js/components/common/badge';
import AssetName from 'js/components/common/assetName';
import {formatTime} from 'js/utils';
import type {AssetResponse} from 'js/dataInterface';
import assetUtils from 'js/assetUtils';
import styles from './projectsTableRow.module.scss';
import classNames from 'classnames';

interface ProjectsTableRowProps {
  asset: AssetResponse;
  highlightedFields: ProjectFieldName[];
}

export default function ProjectsTableRow(props: ProjectsTableRowProps) {
  const navigate = useNavigate();

  const onRowClick = () => {
    navigate(ROUTES.FORM_SUMMARY.replace(':uid', props.asset.uid));
  };

  const renderColumnContent = (field: ProjectFieldDefinition) => {
    switch (field.name) {
      case 'name':
        return <AssetName asset={props.asset}/>;
      case 'description':
        return props.asset.settings.description;
      case 'status':
        if (props.asset.has_deployment && !props.asset.deployment__active) {
          return <Badge
            color='light-amber'
            size='s'
            icon='project-archived'
            label={t('archived')}
          />;
        } else if (props.asset.has_deployment) {
          return <Badge
            color='light-blue'
            size='s'
            icon='project-deployed'
            label={t('deployed')}
          />;
        } else {
          return <Badge
            color='light-teal'
            size='s'
            icon='project-draft'
            label={t('draft')}
          />;
        }
      case 'ownerUsername':
        return assetUtils.getAssetOwnerDisplayName(props.asset.owner__username);
      case 'ownerFullName':
        return 'ENDPOINT?';
      case 'ownerEmail':
        return 'ENDPOINT?';
      case 'ownerOrganisation':
        return 'ENDPOINT?';
      case 'dateDeployed':
        return 'ENDPOINT?';
      case 'dateModified':
        return formatTime(props.asset.date_modified);
      case 'sector':
        return assetUtils.getSectorDisplayString(props.asset);
      case 'countries':
        return assetUtils.getCountryDisplayString(props.asset);
      case 'languages':
        return assetUtils.getLanguagesDisplayString(props.asset);
      case 'submissions':
        return (
          <Badge color='cloud' size='m' label={props.asset.summary.row_count}/>
        );
      default:
        return null;
    }
  };

   return (
    <div
      className={classNames(
        styles.row,
        styles['row-project'],
        styles[`row-${props.asset.asset_type}`]
      )}
      onClick={onRowClick}
    >
      {Object.values(PROJECT_FIELDS).map((field: ProjectFieldDefinition) =>
        <div
          className={classNames({
            [styles.cell]: true,
            [styles[`cell-${field.name}`]]: true,
            [styles['cell-highlighted']]: props.highlightedFields.includes(field.name),
          })}
          key={field.name}
        >
          {renderColumnContent(field)}
        </div>
      )}
    </div>
  );
}
