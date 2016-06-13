'use strict';
var fetch = require('isomorphic-fetch');

var config = {
    /**
     * options used to every fetch request
     */
    globalFetchOptions: {},

    /**
     * fetch request base url
     * notice: must end with /
     * @type {string}
     */
    baseURL: '/',
    /**
     * call before send fetch request
     * default do nothing
     * @param {Request} request Request ref
     */
    fetchStartHook: null,
    /**
     * call after fetch request end
     * default do nothing
     * @param {Request} request Request ref
     */
    fetchEndHook: null
};

/**
 * Request
 * @param {object} options
 * @param {string} options.url
 * @returns {Request}
 * @constructor
 */
function Request(options) {

    /**
     * store request options
     * @type {object}
     */
    this.options = Object.assign({headers: {}, body: null}, options, config.globalFetchOptions);

    /**
     * has this request been send
     * @type {boolean}
     */
    this.hasSend = false;

    /**
     * The Response interface of the Fetch API represents the response to a request.
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Response
     * @type {object|null}
     */
    this.response = null;

    /**
     * if error happen during request error will store in there,else this will be null
     * @type {object|null}
     */
    this.error = null;

    /**
     * after request finish without error,response json data will store in there,else will be {}
     * @type {object}
     */
    this.responseData = null;

}

/**
 * reset query param in request url by append ? and query param to end of url
 * @param {Object} obj
 * @returns {Request}
 */
Request.prototype.queryParam = function (obj) {
    var arr = [];
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            arr.push(key + '=' + obj[key])
        }
    }
    this.options.url = this.options.url.split('?')[0] + '?' + arr.join('&');
    return this;
};
/**
 * set request body use json
 * support json type only
 * HTTP Header Content-Type will set as application/json
 * @param {object} obj pure json object
 * @returns {Request}
 */
Request.prototype.body = function (obj) {
    this.options.body = JSON.stringify(obj);
    this.options.headers['Content-Type'] = 'application/json';
    return this;
};

/**
 * send fetch request
 * get response's data
 * @returns {Promise} resolve(json|null|string), reject(Request)
 * resolve:
 *      if response content-type is null,then resolve null
 *      if response content-type has string json,then read response data as json and resolve pure json
 *      else read response data as text and resolve plain text
 */
Request.prototype.send = function () {
    var self = this;
    return new Promise(function (resolve, reject) {
        if (self.hasSend) {
            if (self.error) {
                reject(self);
            } else {
                resolve(self.responseData);
            }
        } else {
            self.hasSend = true;
            var fetchStartHook = config.fetchStartHook;
            var fetchEndHook = config.fetchEndHook;
            fetchStartHook && fetchStartHook(self);
            //noinspection JSUnresolvedFunction
            fetch(self.options.url, self.options).then(function (response) {
                self.response = response;
                if (response.ok) {
                    var contentType = response.headers.get('content-type');
                    if (contentType == null) {
                        return Promise.resolve();
                    } else {
                        if (/.*json.*/.test(contentType)) {
                            //noinspection JSUnresolvedFunction
                            return response.json();
                        } else {
                            return response.text();
                        }
                    }
                } else {
                    return Promise.reject(response.statusText);
                }
            }).then(function (json) {
                fetchEndHook && fetchEndHook(self);
                self.responseData = json;
                resolve(json);
            }).catch(function (err) {
                fetchEndHook && fetchEndHook(self);
                self.error = err;
                reject(self);
            })
        }
    });
};

/**
 * send request follow _links's href
 * @param {string[]} keys links href in order
 * @returns {Promise} resolve(json), reject(Request)
 */
Request.prototype.follow = function (keys) {
    var self = this;
    return new Promise(function (resolve, reject) {
        function doFollow(data) {
            var key = keys.shift();
            if (key) {
                var links = data['_links'];
                var url = links[key];
                if (url) {
                    url = url['href'];
                    exports.get(url).send().then(function (data) {
                        doFollow(data);
                    }).catch(function (self) {
                        reject(self);
                    })
                } else {
                    self.error = 'no key=' + key + ' \nin links=' + JSON.stringify(links, null, 4);
                    reject(self);
                }
            } else {
                resolve(data);
            }
        }

        self.send().then(function (data) {
            doFollow(data);
        }).catch(function (self) {
            reject(self);
        })

    })
};

function buildHttpMethodFunction(method) {

    /**
     * make http request user fetch API
     * @param {string} url full url string
     * @returns {Request}
     */
    function httpRequest(url) {
        return new Request({url: url, method: method});
    }

    return httpRequest;
}

exports.config = config;

/**
 * make http get request
 * @param {string} url full url string
 * @returns {Request}
 */
exports.get = buildHttpMethodFunction('GET');

/**
 * make http post request
 * @param {string} url full url string
 * @returns {Request}
 */
exports.post = buildHttpMethodFunction('POST');

/**
 * make http patch request
 * @param {string} url full url string
 * @returns {Request}
 */
exports.patch = buildHttpMethodFunction('PATCH');

/**
 * make http put request
 * @param {string} url full url string
 * @returns {Request}
 */
exports.put = buildHttpMethodFunction('PUT');

/**
 * make http delete request
 * @param {string} url full url string
 * @returns {Request}
 */
exports.delete = buildHttpMethodFunction('DELETE');

/**
 * mockRequest a request with data
 * @param {object} data
 * @returns {Request}
 */
exports.mockRequest = function (data) {
    var url = data['_links']['self']['href'];
    var req = new Request({url: url, method: 'GET'});
    req.responseData = data;
    req.hasSend = true;
    return req;
};