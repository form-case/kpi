import React from 'react';
import cx from 'classnames';
import Button from 'js/components/common/button';
import {ACCOUNT_ROUTES} from 'js/account/routes';
import {useNavigate} from 'react-router-dom';
import styles from './overLimitBanner.module.scss';
import Icon from 'js/components/common/icon';

interface OverLimitBannerProps {
  warning?: boolean;
  limits: string[];
  interval: string;
  usagePage: boolean;
}

const OverLimitBanner = (props: OverLimitBannerProps) => {
  const navigate = useNavigate();
  if (!props.limits.length) {
    return null;
  }
  return (
    <div
      className={cx(styles.limitBannerContainer, {
        [styles.warningBanner]: props.warning,
        [styles.usagePage]: props.usagePage,
      })}
    >
      <Icon name={'alert'} size='m' color={props.warning ? 'amber' : 'red'} />
      <div className={styles.bannerContent}>
        {props.warning
          ? t('You are approaching your')
          : t('You have reached your')}
        <strong>
          {' '}
          {props.interval === 'month' ? t('monthly') : t('yearly')}{' '}
          {props.limits.map((item, i) => (
            <span key={i}>
              {i > 0 && props.limits.length > 2 && ', '}
              {i === props.limits.length - 1 && i > 0 && t(' and ')}
              {item}
            </span>
          ))}{' '}
          {t('limit')}
          {props.limits.length > 1 && 's'}
        </strong>
        {'. '}
        {props.warning && (
          <>
            <a
              href={'https://www.kobotoolbox.org/pricing/'}
              className={styles.bannerLink}
            >
              {t('Learn more')}
            </a>{' '}
            {t('about upgrading your plan.')}
          </>
        )}
        {!props.warning && (
          <>
            <span>
              {t(
                'Please upgrade your plan or purchase an add-on to increase your usage limits.'
              )}
            </span>
          </>
        )}
      </div>
      {props.warning && !props.usagePage && (
        <Button
          type={'bare'}
          color={'dark-blue'}
          endIcon='arrow-right'
          size='m'
          label={t('Monitor usage')}
          onClick={() => navigate(ACCOUNT_ROUTES.USAGE)}
          aria-label={t('monitor usage')}
          classNames={[styles.bannerBtn]}
        />
      )}
      {(!props.warning || props.usagePage) && (
        <Button
          type={'bare'}
          color={'dark-blue'}
          endIcon='arrow-right'
          size='m'
          label={t('Upgrade now')}
          onClick={() => navigate(ACCOUNT_ROUTES.PLAN)}
          aria-label={t('upgrade now')}
          classNames={[styles.bannerBtn]}
        />
      )}
    </div>
  );
};

export default OverLimitBanner;
