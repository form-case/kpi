// Thin kobo api wrapper around fetch
import {ROOT_URL} from './constants';
import type {Json} from './components/common/common.interfaces';
import type {FailResponse} from 'js/dataInterface';
import {notify} from 'js/utils';

/**
 * Useful for handling the fail responses from API. Its main goal is to display
 * a helpful error toast notification and to pass the error message to Raven.
 *
 * It can detect if we got HTML string as response and uses a generic message
 * instead of spitting it out. The error message displayed to the user can be
 * customized using the optional `toastMessage` argument.
 */
export function handleApiFail(response: FailResponse, toastMessage?: string) {
  // Avoid displaying toast when purposefuly aborted a request
  if (response.status === 0 && response.statusText === 'abort') {
    return;
  }

  let message = response.responseText;

  // Detect if response is HTML code string
  if (
    typeof message === 'string' &&
    message.includes('</html>') &&
    message.includes('</body>')
  ) {
    // Try plucking the useful error message from the HTML string - this works
    // for Werkzeug Debugger only. It is being used on development environment,
    // on production this would most probably result in undefined message (and
    // thus falling back to the generic message below).
    const htmlDoc = new DOMParser().parseFromString(message, 'text/html');
    message = htmlDoc.getElementsByClassName('errormsg')?.[0]?.innerHTML;
  }

  const htmlMessage = message;

  if (toastMessage || !message) {
    message = toastMessage || t('An error occurred');
    if (response.status || response.statusText) {
      message += `\n\n${response.status} ${response.statusText}`;
    } else if (!window.navigator.onLine) {
      // another general case — the original fetch response.message might have
      // something more useful to say.
      message += '\n\n' + t('Your connection is offline');
    }
  }

  // show the prettiest version of the error to the user
  notify.error(message);

  // prefer sending the HTML error to Raven, since it should contain more detailed information
  window.Raven?.captureMessage(htmlMessage || message);
}

const JSON_HEADER = 'application/json';

// TODO: Figure out how to improve UX if there are many errors happening
// simultaneously (other than deciding not to show them.)
//
// const notifyServerErrorThrottled = throttle(
//   (errorMessage: string) => {
//     notify(errorMessage, 'error');
//   },
//   500 // half second
// );

type FetchHttpMethod = 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE';

interface FetchDataOptions {
  /**
   * By default we display an error toast notification when response is not good
   * and the error code is clearly error. If you need to handle the notification
   * in some other manner make it `false`. This is useful for example if the 404
   * response is a meaningful "good" response.
   *
   * `true` by default
   */
  notifyAboutError?: boolean;
  /**
   * Override the default error toast message text. Raven will still receive the
   * default error message, for debugging purposes.
   *
   * Only applies when `notifyAboutError` is `true`.
   */
  errorMessageDisplay?: string;
  /**
   * Useful if you already have a full URL to be called and there is no point
   * adding `ROOT_URL` to it.
   *
   * `true` by default
   */
  prependRootUrl?: boolean;
  /**
   * Include the headers along with the response body, under the `headers` key.
   * Useful if, for example, you need to determine the age of a cached response.
   * **/
  includeHeaders?: boolean;
}

const fetchData = async <T>(
  /**
   * If you have full url to be called, remember to use `prependRootUrl` option.
   */
  path: string,
  method: FetchHttpMethod,
  data?: Json,
  options?: FetchDataOptions
) => {
  // Prepare options
  const defaults = {notifyAboutError: true, prependRootUrl: true};
  const {notifyAboutError, prependRootUrl} = Object.assign(
    {},
    defaults,
    options
  );

  const headers: {[key: string]: string} = {
    Accept: JSON_HEADER,
  };

  // For when it's needed we pass authentication data
  if (method === 'DELETE' || data) {
    const csrfCookie = document.cookie.match(/csrftoken=(\w{64})/);
    if (csrfCookie) {
      headers['X-CSRFToken'] = csrfCookie[1];
    }

    headers['Content-Type'] = JSON_HEADER;
  }

  // This function is expected to be used mostly with paths pointing at API
  // endpoints that start on "/", but sometimes we already have full URL and
  // there is no point adding anything to it.
  const url = prependRootUrl ? ROOT_URL + path : path;

  const fetchOptions: RequestInit = {
    method: method,
    headers,
  };

  if (data) {
    fetchOptions['body'] = JSON.stringify(data);
  }

  const response = await fetch(url, fetchOptions);

  const contentType = response.headers.get('content-type');

  // Error handling
  if (!response.ok) {
    // This will be returned with the promise rejection. It can include that
    // response JSON, but not all endpoints/situations will produce one.
    const failResponse: FailResponse = {
      status: response.status,
      statusText: response.statusText,
    };

    if (contentType && contentType.indexOf('application/json') !== -1) {
      failResponse.responseText = await response.text();
      try {
        failResponse.responseJSON = JSON.parse(failResponse.responseText);
      } catch {
        // If the response text is not a proper JSON, we simply don't add it to
        // the rejection object.
      }
    }

    // For these codes we might display a toast with HTTP status (through
    // `handleApiFail` helper)
    if (
      notifyAboutError &&
      (response.status === 401 ||
        response.status === 403 ||
        response.status === 404 ||
        response.status >= 500)
    ) {
      handleApiFail(failResponse, options?.errorMessageDisplay);
    }

    return Promise.reject(failResponse);
  }

  if (contentType && contentType.indexOf('application/json') !== -1) {
    if (options?.includeHeaders) {
      return {
        headers: response.headers,
        ...(await response.json()),
      } as {headers: Headers} & T;
    }
    return (await response.json()) as Promise<T>;
  }
  return {} as T;
};

/** GET Kobo API at path */
export const fetchGet = async <T>(path: string, options?: FetchDataOptions) =>
  fetchData<T>(path, 'GET', undefined, options);

/** POST data to Kobo API at path */
export const fetchPost = async <T>(
  path: string,
  data: Json,
  options?: FetchDataOptions
) => fetchData<T>(path, 'POST', data, options);

/** POST data to Kobo API at url */
export const fetchPostUrl = async <T>(
  url: string,
  data: Json,
  options?: FetchDataOptions
) => {
  options = Object.assign({}, options, {prependRootUrl: false});
  return fetchData<T>(url, 'POST', data, options);
};

/** PATCH (update) data to Kobo API at path */
export const fetchPatch = async <T>(
  path: string,
  data: Json,
  options?: FetchDataOptions
) => fetchData<T>(path, 'PATCH', data, options);

/** PUT (replace) data to Kobo API at path */
export const fetchPut = async <T>(
  path: string,
  data: Json,
  options?: FetchDataOptions
) => fetchData<T>(path, 'PUT', data, options);

/** DELETE data to Kobo API at path, data is optional */
export const fetchDelete = async <T>(
  path: string,
  data?: Json,
  options?: FetchDataOptions
) => fetchData<T>(path, 'DELETE', data, options);
