/**
 *  ioBroker.vis
 *  https://github.com/ioBroker/ioBroker.vis
 *
 *  Copyright (c) 2022 bluefox https://github.com/GermanBluefox,
 *  Creative Common Attribution-NonCommercial (CC BY-NC)
 *
 *  http://creativecommons.org/licenses/by-nc/4.0/
 *
 * Short content:
 * Licensees may copy, distribute, display and perform the work and make derivative works based on it only if they give the author or licensor the credits in the manner specified by these.
 * Licensees may copy, distribute, display, and perform the work and make derivative works based on it only for noncommercial purposes.
 * (Free for non-commercial use).
 */

import React from 'react';
import PropTypes from 'prop-types';

import {
    Button, Dialog, DialogContent, DialogTitle, DialogActions,
} from '@mui/material';

import { I18n } from '@iobroker/adapter-react-v5';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';
import AlertIcon from '@mui/icons-material/Warning';

import './css/vis.css';
import './css/backgrounds.css';
// import './lib/can.custom.js';
// import $$ from './lib/quo.standalone'; // Gestures library
import './visWords';

import VisView from './visView';
import VisFormatUtils from './visFormatUtils';
import { getUrlParameter, extractBinding } from './visUtils';

function _translateWord(text, lang, dictionary) {
    if (!text) {
        return '';
    }
    lang = lang || window.systemLang;
    dictionary = dictionary || window.systemDictionary;

    if (dictionary[text]) {
        let newText = dictionary[text][lang];
        if (newText) {
            return newText;
        }
        if (lang !== 'en') {
            newText = dictionary[text].en;
            if (newText) {
                return newText;
            }
        }
    } else if (typeof text === 'string' && !text.match(/_tooltip$/)) {
        // console.log(`"${text}": {en: "${text}", de: "${text}", ru: "${text}"},`);
    } else if (typeof text !== 'string') {
        console.warn(`Trying to translate non-text: ${text}`);
    }

    return text;
}

function translate(text, arg1, arg2, arg3) {
    text = _translateWord(text);

    let pos = text.includes('%s');
    if (pos !== -1) {
        text = text.replace('%s', arg1);
    } else {
        return text;
    }

    pos = text.includes('%s');
    if (pos !== -1) {
        text = text.replace('%s', arg2);
    } else {
        return text;
    }

    pos = text.includes('%s');
    if (pos !== -1) {
        text = text.replace('%s', arg3);
    }

    return text;
}

class VisEngine extends React.Component {
    constructor(props) {
        super(props);
        window.jQuery = window.$;
        window.$ = window.jQuery; // jQuery library
        // window.$$ = $$; // Gestures library
        window.systemLang = props.lang || window.systemLang || 'en';

        // modify jquery dialog to add it to view (originally dialog was added to body) (because of styles)
        // eslint-disable-next-line func-names
        window.$.ui.dialog.prototype._appendTo = function () {
            const wid = this.options.wid;
            const view = Object.keys(props.views).find(v => props.views[v].widgets && props.views[v].widgets[wid]);
            return this.document.find(view ? `#visview_${view}` : 'body').eq(0);
        };

        this.state = {
            ready: false,

            timeInterval: JSON.parse(window.localStorage.getItem('timeInterval')) || 'week',
            timeStart: JSON.parse(window.localStorage.getItem('timeStart')) || null,
        };

        // this.jsonViews = JSON.stringify(props.views);

        // this.divRef = React.createRef();

        this.can = window.can;
        this.scripts = null;
        this.isTouch = 'ontouchstart' in document.documentElement;
        this.debounceInterval = 700;

        this.subscribes = {};
        this.allWidgets = {};
        this.wakeUpCallbacks = [];
        this.widgetChangeHandlers = {};
        this.refViews = []; // List of views (refs)
        this.fontNames = [
            'Verdana, Geneva, sans-serif',
            'Georgia, "Times New Roman", Times, serif',
            '"Courier New", Courier, monospace',
            'Arial, Helvetica, sans-serif',
            'Tahoma, Geneva, sans-serif',
            '"Trebuchet MS", Arial, Helvetica, sans-serif',
            '"Arial Black", Gadget, sans-serif',
            '"Times New Roman", Times, serif',
            '"Palatino Linotype", "Book Antiqua", Palatino, serif',
            '"Lucida Sans Unicode", "Lucida Grande", sans-serif',
            '"MS Serif", "New York", serif',
            '"Comic Sans MS", cursive',
        ];
        this.viewsActiveFilter = {};
        this.statesDebounce = {};
        this.onChangeCallbacks = [];

        this.idControlInstance = `${this.props.adapterName}.${this.props.instance}.control.instance`;
        this.idControlData = `${this.props.adapterName}.${this.props.instance}.control.data`;
        this.idControlCommand = `${this.props.adapterName}.${this.props.instance}.control.command`;

        this.linkContext = {
            visibility: {},
            signals: {},
            lastChanges: {},
            bindings: {},
            unregisterChangeHandler: this.unregisterChangeHandler,
            registerChangeHandler: this.registerChangeHandler,
            subscribe: this.subscribe,
            unsubscribe: this.unsubscribe,
            getViewRef: this.getViewRef,
            registerViewRef: this.registerViewRef,
            unregisterViewRef: this.unregisterViewRef,
        };

        this.refSound = /^((?!chrome|android).)*safari/i.test(window.navigator.userAgent) ? React.createRef() : null;

        this.conn = this.createConnection();
        this.canStates = this.initCanObjects();
        this.vis = this.createLegacyVisObject();

        window._   = this.vis._;               // legacy translation function
        window.vis = this.vis;
        window.translateWord = _translateWord; // legacy translation function
        window._setTimeout = (func, timeout, arg1, arg2, arg3, arg4, arg5, arg6) => setTimeout(() => func(arg1, arg2, arg3, arg4, arg5, arg6), timeout);
        window._setInterval = (func, interval, arg1, arg2, arg3, arg4, arg5, arg6) => setInterval(() => func(arg1, arg2, arg3, arg4, arg5, arg6), interval);

        this.formatUtils = new VisFormatUtils({ vis: this.vis });

        this.loadLegacyObjects()
            .then(() => this.loadEditWords())
            .then(() => this.readGroups())
            .then(userGroups => {
                this.userGroups = userGroups;
                return this.props.socket.getCurrentUser();
            })
            .then(user => {
                this.user = user;
                this.vis.user = user;
                this.vis.loginRequired = this.props.socket.isSecure;
                return this.props.socket.getSystemConfig();
            })
            .then(systemConfig => {
                this.vis.dateFormat = systemConfig.common.dateFormat;
                this.vis.isFloatComma = systemConfig.common.isFloatComma;
                this.vis.language = systemConfig.common.language || 'en';
                this.systemConfig = systemConfig;

                this.props.socket.subscribeState(this.idControlInstance, this.onStateChange);
                this.props.socket.subscribeState(this.idControlData, this.onStateChange);
                this.props.socket.subscribeState(this.idControlCommand, this.onStateChange);

                return this.loadWidgets();
            })
            .then(() => this.setState({ ready: true }));
    }

    setTimeInterval = timeInterval => {
        this.setState({ timeInterval });
        window.localStorage.setItem('timeInterval', JSON.stringify(timeInterval));
    };

    setTimeStart = timeStart => {
        this.setState({ timeStart });
        window.localStorage.setItem('timeStart', JSON.stringify(timeStart));
    };

    detectWakeUp() {
        this.oldTime = Date.now();
        this.wakeUpDetectorInterval = this.wakeUpDetectorInterval || setInterval(() => {
            const currentTime = Date.now();
            if (currentTime > this.oldTime + 10000) {
                this.oldTime = currentTime;
                this.wakeUpCallbacks.forEach(item => {
                    if (typeof item.cb === 'function') {
                        try {
                            item.cb(item.wid);
                        } catch (error) {
                            console.error(`Cannot wakeup ${item.wid}: ${error}`);
                        }
                    }
                });
            } else {
                this.oldTime = currentTime;
            }
        }, 2500);
    }

    componentDidMount() {
        this.detectWakeUp();
    }

    componentWillUnmount() {
        this.wakeUpDetectorInterval && clearInterval(this.wakeUpDetectorInterval);
        this.wakeUpDetectorInterval = null;

        // unsubscribe all
        Object.keys(this.subscribes).forEach(id =>
            this.props.socket.unsubscribeState(id, this.onStateChange));

        this.props.socket.unsubscribeState(this.idControlInstance, this.onStateChange);
        this.props.socket.unsubscribeState(this.idControlData, this.onStateChange);
        this.props.socket.unsubscribeState(this.idControlCommand, this.onStateChange);

        let userScript = window.document.getElementById('#vis_user_scripts');
        if (userScript) {
            userScript.remove();
            userScript = null;
        }

        let userCommonCss = window.document.getElementById('#vis_common_user');
        if (userCommonCss) {
            userCommonCss.remove();
            userCommonCss = null;
        }

        let userUserCss = window.document.getElementById('#vis_user');
        if (userUserCss) {
            userUserCss.remove();
            userUserCss = null;
        }

        this.subscribes = {};
    }

    loadLegacyObjects() {
        if (this.props.runtime) {
            return Promise.resolve();
        }

        return this.conn.getObjects()
            .then(objects => this.vis.objects = objects);
    }

    buildLegacyStructures = () => {
        this.buildLegacySubscribing();
        if (this.vis.binds.materialdesign?.helper?.subscribeStatesAtRuntime && !this.vis.binds.materialdesign.helper.subscribeStatesAtRuntime.__inited) {
            this.vis.binds.materialdesign.helper.subscribeStatesAtRuntime = (/* wid, widgetName, callback, debug */) => {};
            this.vis.binds.materialdesign.helper.subscribeStatesAtRuntime.__inited = true;
        }
    };

    buildLegacySubscribing() {
        // go through all views
        this.vis.subscribing = {
            activeViews: [],
            byViews: {},
            active: [],
            IDs: [],
        };

        Object.keys(this.props.views).forEach(viewId => {
            if (viewId !== '___settings') {
                this.vis.subscribing.byViews[viewId] = [];
                this.vis.subscribing.activeViews.push(viewId);
            }
        });
    }

    createLegacyVisObject() {
        return {
            version: 2,
            states: this.canStates,
            objects: {},
            isTouch: this.isTouch,
            activeWidgets: [],
            navChangeCallbacks: [],
            editMode: !!this.props.editMode,
            binds: {},
            views: this.props.views,
            activeView: this.props.selectedView,
            language: this.props.lang,
            user: '',
            projectPrefix: this.props.projectName,
            _: translate,
            dateFormat: '',
            instance: window.localStorage.getItem('visInstance'),
            loginRequired: false,
            viewsActiveFilter: this.viewsActiveFilter,
            onChangeCallbacks: this.onChangeCallbacks,
            subscribing: {
                activeViews: [],
                byViews: {},
                active: [],
                IDs: [],
            },
            conn: this.conn,
            updateContainers: () => {
                const refViews = this.refViews;
                Object.keys(refViews).forEach(view => refViews[view].onCommand('updateContainers'));
            },
            renderView: (viewDiv, view, hidden, cb) => {
                console.warn('renderView not implemented: ', viewDiv, view, hidden);
                cb && cb(viewDiv, view);
            },
            updateFilter: view => {
                view = view || this.props.activeView;
                if (this.refViews[view]) {
                    // collect all possible filter of widgets
                    if (this.refViews[view]?.onCommand) {
                        return this.refViews[view]?.onCommand('collectFilters');
                    }
                }
                return [];
            },
            destroyUnusedViews: () => {
                console.warn('destroyUnusedViews not implemented');
            },
            changeFilter: (view, filter, showEffect, showDuration, hideEffect, hideDuration) =>
                this.changeFilter(view, filter, showEffect, showDuration, hideEffect, hideDuration),
            detectBounce: (el, isUp) => {
                if (!this.isTouch) {
                    return false;
                }

                // Protect against two events
                const now = Date.now();
                // console.log('gclick: ' + this.lastChange + ' ' + (now - this.lastChange));
                if (this.lastChange && now - this.lastChange < this.debounceInterval) {
                    // console.log('gclick: filtered');
                    return true;
                }
                let tag = el.tagName.toLowerCase();
                while (tag !== 'div') {
                    el = el.parentNode;
                    tag = el.tagName.toLowerCase();
                }
                const lastClick = el[`__vis_${isUp ? 'lcu' : 'lc'}`];
                // console.log('click: ' + lastClick + ' ' + (now - lastClick));
                if (lastClick && now - lastClick < this.debounceInterval) {
                    console.log('click: filtered out');
                    return true;
                }
                el[`__vis_${isUp ? 'lcu' : 'lc'}`] = now;
                return false;
            },
            setValue: this.setValue,
            changeView: (viewDiv, view, hideOptions, showOptions, sync, cb) => {
                window.location.hash = `#${encodeURIComponent(view)}`;
                cb && cb(viewDiv, view);
            },
            onWakeUp: (cb, wid) => {
                if (!wid) {
                    console.warn('No widget ID for onWakeUp callback! Please fix');
                }
                console.warn('onWakeUp not implemented');
                this.wakeUpCallbacks.push({ cb, wid });
            },
            inspectWidgets: (viewDiv, view, addWidget, delWidget, onlyUpdate) => {
                console.warn('inspectWidgets not implemented: ', viewDiv, view, addWidget, delWidget, onlyUpdate);
            },
            showMessage: (message, title, icon, width, callback) => this.showMessage(message, title, icon, width, callback),
            showWidgetHelper: (viewDiv, view, wid, isShow) => {
                console.warn('showWidgetHelper not implemented: ', viewDiv, view, wid, isShow);
            },
            findNearestResolution: (resultRequiredOrX, height) => this.findNearestResolution(resultRequiredOrX, height),
            addFont: fontName => {
                if (!this.fontNames.includes(fontName)) {
                    this.fontNames.push(fontName);
                    if (this.props.onFontsUpdate) {
                        this.fontTimer && clearTimeout(this.fontTimer);
                        this.fontTimer = setTimeout(() => {
                            this.fontTimer = null;
                            this.props.onFontsUpdate(this.fontNames);
                        });
                    }
                }
            },
            registerOnChange: (callback, arg, wid) => {
                !wid && console.warn('No widget ID for registerOnChange callback! Please fix');

                if (!this.onChangeCallbacks.find(item => item.callback === callback && item.arg === arg && (!wid || item.wid === wid))) {
                    this.onChangeCallbacks.push({ callback, arg, wid });
                }
            },
            unregisterOnChange: (callback, arg, wid) => {
                !wid && console.warn('No widget ID for unregisterOnChange callback! Please fix');

                const index = this.onChangeCallbacks.findIndex(item => item.callback === callback &&
                    (arg === undefined || arg === null || item.arg === arg) &&
                    (!wid || item.wid === wid));

                if (index >= 0) {
                    this.onChangeCallbacks.splice(index, 1);
                }
            },
            generateInstance: () => {
                let instance = (Math.random() * 4294967296).toString(16);
                instance = `0000000${instance}`;
                instance = instance.substring(instance.length - 8);
                window.vis.instance = instance;
                window.localStorage.setItem('visInstance', instance);
                return this.instance;
            },
            findByRoles: (stateId, roles) => {
                if (typeof roles !== 'object') {
                    roles = [roles];
                } else {
                    roles = JSON.parse(JSON.stringify(roles));
                }
                const result = {};
                // try to detect other values

                // Go through all channels of this device
                const parts = stateId.split('.');
                parts.pop(); // remove state
                const channel = parts.join('.');
                const reg = new RegExp(`^${channel.replace(/\./g, '\\.')}\\.`);

                // channels
                for (const id in this.vis.objects) {
                    if (reg.test(id) &&
                        this.vis.objects[id].common &&
                        this.vis.objects[id].type === 'state') {
                        for (let r = 0; r < roles.length; r++) {
                            if (this.vis.objects[id].common.role === roles[r]) {
                                result[roles[r]] = id;
                                roles.splice(r, 1);
                                break;
                            } else
                            if (!roles.length) {
                                break;
                            }
                        }
                    }
                }
                // try to search in channels
                if (roles.length) {
                    parts.pop(); // remove channel
                    const device = parts.join('.');
                    const _reg = new RegExp(`^${device.replace(/\./g, '\\.')}\\.`);
                    for (const id in this.vis.objects) {
                        if (_reg.test(id) &&
                            this.vis.objects[id].common &&
                            this.vis.objects[id].type === 'state'
                        ) {
                            for (let r = 0; r < roles.length; r++) {
                                if (this.vis.objects[id].common.role === roles[r]) {
                                    result[roles[r]] = id;
                                    roles.splice(r, 1);
                                    break;
                                }
                            }
                            if (!roles.length) {
                                break;
                            }
                        }
                    }
                }
                return result;
            },
            findByName: (stateId, objName) => {
                // try to detect other values

                // Go through all channels of this device
                const parts = stateId.split('.');
                parts.pop(); // remove state
                const channel = parts.join('.');

                // check same channel
                const id = `${channel}.${objName}`;
                if ((id in this.vis.objects) &&
                    this.vis.objects[id].common &&
                    this.vis.objects[id].type === 'state'
                ) {
                    return id;
                }

                // try to search in channels
                parts.pop(); // remove channel
                const device = parts.join('.');
                const reg = new RegExp(`^${device.replace(/\./g, '\\.')}\\..*\\.${objName}`);
                for (const _id in this.vis.objects) {
                    if (reg.test(_id) &&
                        this.vis.objects[_id].common &&
                        this.vis.objects[_id].type === 'state'
                    ) {
                        return _id;
                    }
                }
                return false;
            },
            hideShowAttr: widAttr => console.warn('hideShowAttr is deprecated: ', widAttr),
            bindingsCache: {},
            extractBinding: (format, doNotIgnoreEditMode) => {
                if ((!doNotIgnoreEditMode && !!this.props.editMode) || !format) {
                    return null;
                }

                if (this.vis.bindingsCache[format]) {
                    return JSON.parse(JSON.stringify(this.vis.bindingsCache[format]));
                }

                const result = extractBinding(format);

                // cache bindings
                if (result) {
                    this.vis.bindingsCache = this.vis.bindingsCache || {};
                    this.vis.bindingsCache[format] = JSON.parse(JSON.stringify(result));
                }

                return result;
            },
            formatBinding: (format, view, wid, widget, widgetData, values) =>
                this.formatUtils.formatBinding(format, view, wid, widget, widgetData, values),
            getViewOfWidget: id => {
                // find view of this widget
                for (const v in this.props.views) {
                    if (v === '___settings') {
                        continue;
                    }
                    if (this.props.views[v]?.widgets && this.props.views[v].widgets[id]) {
                        return v;
                    }
                }
                return null;
            },
            confirmMessage: (message, title, icon, width, callback) =>
                this.props.onConfirmDialog(message, title, icon, width, callback),
            config: {}, // storage of dialog positions and size (Deprecated)
            showCode: (code, title, mode) => this.props.onShowCode(code, title, mode),
            findCommonAttributes: (/* view, widgets */) => {

            },
        };
    }

    changeFilter(view, filter, showEffect, showDuration, hideEffect, hideDuration) {
        view = view || this.props.activeView;
        if (this.refViews[view]?.onCommand) {
            this.refViews[view]?.onCommand('changeFilter', {
                filter, showEffect, showDuration, hideEffect, hideDuration,
            });
        }
    }

    showMessage(message, title, icon, width, callback) {
        if (typeof icon === 'number') {
            callback = width;
            width = icon;
            icon = null;
        }
        if (typeof title === 'function') {
            callback = title;
            title = null;
        } else if (typeof icon === 'function') {
            callback = icon;
            icon = null;
        } else if (typeof width === 'function') {
            callback = width;
            width = null;
        }

        this.setState({
            showMessage: {
                message, title, icon, width, callback,
            },
        });
    }

    renderMessageDialog() {
        if (!this.state.showMessage) {
            return null;
        }

        return <Dialog
            key="__messageDialog"
            open={!0}
            onClose={() => {
                const callback = this.state.showMessage.callback;
                if (typeof callback === 'function') {
                    callback(false);
                }
                this.setState({ showMessage: null });
            }}
            maxWidth="md"
        >
            <DialogTitle>{this.state.showMessage.title || I18n.t('Message')}</DialogTitle>
            <DialogContent>
                { this.state.showMessage.icon === 'alert' ? <AlertIcon /> : null }
                { this.state.showMessage.message }
            </DialogContent>
            <DialogActions>
                <Button
                    variant="contained"
                    onClick={() => {
                        const callback = this.state.showMessage.callback;
                        if (typeof callback === 'function') {
                            callback(true);
                        }
                        this.setState({ showMessage: null });
                    }}
                    color="primary"
                    startIcon={<CheckIcon />}
                >
                    {I18n.t('Ok')}
                </Button>
                { this.state.showMessage.callback ? <Button
                    variant="contained"
                    color="grey"
                    onClick={() => {
                        const callback = this.state.showMessage.callback;
                        if (typeof callback === 'function') {
                            callback(false);
                        }
                        this.setState({ showMessage: null });
                    }}
                    startIcon={<CloseIcon />}
                >
                    {I18n.t('Cancel')}
                </Button> : null }
            </DialogActions>
        </Dialog>;
    }

    createConnection() {
        // props.socket
        return {
            namespace: this.props.adapterId,
            logError: errorText => {
                console.error(`Error: ${errorText}`);
                this.props.socket.log(errorText, 'error');
            },
            getIsConnected: () => this.props.socket.isConnected(),
            getGroups: (groupName, useCache, cb) => {
                if (typeof groupName === 'function') {
                    cb = groupName;
                    groupName = null;
                    useCache = false;
                }
                if (typeof groupName === 'boolean') {
                    cb = useCache;
                    useCache = groupName;
                    groupName = null;
                }
                if (typeof useCache === 'function') {
                    cb = useCache;
                    useCache = false;
                }
                groupName = groupName || '';

                return this.props.socket.getGroups(!useCache)
                    .then(groups => {
                        const result = {};
                        if (groupName) {
                            const gr = `system.group.${groupName}`;
                            groups = groups.filter(group => group._id.startsWith(`${gr}.`) || group._id === gr);
                        }

                        groups.forEach(group => result[group._id] = group);
                        cb(result);
                    })
                    .catch(error => cb(error));
            },
            getConfig: (useCache, cb) => {
                if (typeof useCache === 'function') {
                    cb = useCache;
                    useCache = false;
                }

                return this.props.socket.getSystemConfig(!useCache)
                    .then(systemConfig => cb(null, systemConfig.common))
                    .catch(error => cb(error));
            },
            getObjects: (useCache, cb) => {
                if (typeof useCache === 'function') {
                    cb = useCache;
                    useCache = false;
                }
                let objects = {};

                return new Promise((resolve, reject) => {
                    this.props.socket.getRawSocket().emit('getObjects', (err, res) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        if (res && res.rows) {
                            for (let i = 0; i < res.rows.length; i++) {
                                objects[res.rows[i].id] = res.rows[i].value;
                            }
                        } else {
                            objects = res;
                            resolve(objects);
                        }
                    });
                })
                    .then(() => this.props.socket.getEnums(!useCache))
                    .then(enums => {
                        Object.assign(objects, enums);
                        return this.props.socket.getObjectViewSystem(
                            'instance',
                            'system.adapter.',
                            'system.adapter.\u9999',
                        )
                            .then(rows => {
                                for (let i = 0; i < rows.length; i++) {
                                    objects[rows[i]._id] = rows[i];
                                }

                                const instance = `system.adapter.${this.props.adapterName}.${this.props.instance}`;
                                // find out default file mode
                                if (objects[instance]?.native?.defaultFileMode) {
                                    this.defaultMode = objects[instance].native.defaultFileMode;
                                }
                            });
                    })
                    .then(() => this.props.socket.getObjectViewSystem('chart', '', '\u9999')
                        .catch(() => null))
                    .then(charts => {
                        charts && Object.assign(objects, charts);
                        return this.props.socket.getObjectViewSystem('channel', '', '\u9999');
                    })
                    .then(channels => {
                        Object.assign(objects, channels);
                        return this.props.socket.getObjectViewSystem('device', '', '\u9999');
                    })
                    .then(devices => {
                        Object.assign(objects, devices);
                        if (cb) {
                            cb(null, objects);
                            return null;
                        }

                        return objects;
                    })
                    .catch(error => {
                        console.error(`Cannot load objects: ${error}`);
                        if (cb) {
                            cb(error);
                            return null;
                        }

                        return Promise.reject(error);
                    });
            },
            getLoggedUser: cb => this.props.socket.getCurrentUser()
                .then(user => cb(this.props.socket.isSecure, user)),
            subscribe: IDs => this.subscribe(IDs),
            unsubscribe: IDs => this.unsubscribe(IDs),
            authenticate: (user, password, salt) => {
                this._authRunning = true;

                if (user !== undefined) {
                    this._authInfo = {
                        user,
                        hash: password + salt,
                        salt,
                    };
                }
            },
            getStates: (IDs, cb) => this.props.socket.getForeignStates(IDs)
                .then(data => cb(null, data))
                .catch(error => cb(error || 'Authentication required')),
            setState: (id, val, cb) => this.props.socket.setState(id, val)
                .then(() => cb && cb())
                .catch(error => cb && cb(error)),
            setReloadTimeout: () => {

            },
            setReconnectInterval: () => {

            },
            getUser: () => this.user,
            sendCommand: (instance, command, data, ack) => this.props.socket.setState(this.idControlInstance, { val: instance || 'notdefined', ack: true })
                .then(() => this.props.socket.setState(this.idControlData, { val: data, ack: true }))
                .then(() => this.props.socket.setState(this.idControlCommand, { val: command, ack: ack === undefined ? true : ack })),
            readFile: (filename, cb) => {
                let adapter = this.conn.namespace;
                if (filename[0] === '/') {
                    const p = filename.split('/');
                    adapter = p[1];
                    p.splice(0, 2);
                    filename = p.join('/');
                }

                return this.props.socket.readFile(adapter, filename)
                    .then(data => setTimeout(() => cb(null, data.file, filename, data.mimeType), 0))
                    .catch(error => cb(error));
            },
            getHistory: (id, options, cb) => {
                options = options || {};
                options.timeout = options.timeout || 2000;

                let timeout = setTimeout(() => {
                    timeout = null;
                    cb('timeout');
                }, options.timeout);

                this.props.socket.getHistory(id, options)
                    .then(result => {
                        if (timeout) {
                            clearTimeout(timeout);
                            timeout = null;
                        }
                        cb(null, result);
                    })
                    .catch(error => {
                        if (timeout) {
                            clearTimeout(timeout);
                            timeout = null;
                        }
                        cb(error);
                    });
            },
            getHttp: (url, callback) => this.props.socket.getRawSocket().emit('httpGet', url, data => callback && callback(data)),
            _socket: {
                emit: (cmd, data, cb) => {
                    let promise;
                    if (cmd === 'getObject') {
                        promise = this.props.socket.getObject(data);
                    } else if (cmd === 'getState') {
                        promise = this.props.socket.getState(data);
                    } else if (cmd === 'getStates') {
                        promise = this.props.socket.getStates(data);
                    }
                    if (promise) {
                        promise.then(obj => cb && cb(null, obj))
                            .catch(error => cb && cb(error));
                    } else {
                        console.warn(`Unknown command in _socket.emit: ${cmd}`);
                    }
                },
            },
        };
    }

    registerViewRef = (view, ref, onCommand) => {
        if (this.refViews[view] && this.refViews[view].ref === ref) {
            console.error(`Someone tries to register same ref for view ${view}`);
        } else {
            this.refViews[view] && console.error(`Someone tries to register new ref for view ${view}`);
            this.refViews[view] = { ref, onCommand };
        }
    };

    unregisterViewRef = (view, ref) => {
        if (this.refViews[view] && this.refViews[view].ref === ref) {
            delete this.refViews[view];
        } else if (this.refViews[view]) {
            this.refViews[view] && console.error(`Someone tries to unregister new ref for view ${view}`);
            delete this.refViews[view];
        }
    };

    getViewRef = view => this.refViews[view]?.ref;

    findNearestResolution(resultRequiredOrX, height) {
        let w;
        let h;

        if (height !== undefined && height !== null) {
            w = resultRequiredOrX;
            h = height;
            resultRequiredOrX = false;
        } else {
            w = window.document.body.clientWidth;
            h = window.document.body.clientHeight;
        }

        let result = null;
        const views = [];
        let difference = 10000;

        // First find all with best fitting width
        Object.keys(this.props.views).forEach(view => {
            if (view !== '___settings' &&
                this.props.views[view].settings &&
                this.props.views[view].settings.useAsDefault &&
                // If difference less than 20%
                Math.abs(this.props.views[view].settings.sizex - w) / this.props.views[view].settings.sizex < 0.2
            ) {
                views.push(view);
            }
        });

        views.forEach(view => {
            if (Math.abs(this.props.views[view].settings.sizey - h) < difference) {
                result = view;
                difference = Math.abs(this.props.views[view].settings.sizey - h);
            }
        });

        // try to find by ratio
        if (!result) {
            const ratio = w / h;
            difference = 10000;

            Object.keys(this.props.views).forEach(view => {
                if (view !== '___settings' &&
                    this.props.views[view].settings?.useAsDefault &&
                    // If difference less than 20%
                    this.props.views[view].settings.sizey &&
                    Math.abs(ratio - (this.props.views[view].settings.sizex / this.props.views[view].settings.sizey)) < difference
                ) {
                    result = view;
                    difference = Math.abs(ratio - (this.props.views[view].settings.sizex / this.props.views[view].settings.sizey));
                }
            });
        }

        if (!result && resultRequiredOrX) {
            result = Object.keys(this.props.views).find(view => view !== '___settings');
        }

        return result;
    }

    readGroups(groupName) {
        return this.props.socket.getGroups()
            .then(groups => {
                const result = {};
                if (groupName) {
                    const gg = `system.group.${groupName}`;
                    groups = groups.filter(group => group._id.startsWith(`${gg}.`) || group._id === gg);
                }

                groups.forEach(group => result[group._id] = group);
                return result;
            });
    }

    initCanObjects() {
        // creat "Can" objects
        return new this.can.Map({ 'nothing_selected.val': null });

        /*
        if (false && this.props.editMode) {
           this.canStates.__attr = this.canStates.attr; // save original attr

           const that = this;
           this.canStates.attr = function (attr, val) {
               if (val === undefined) {
                   if (typeof attr === 'string') {
                       // read
                       return this.__attr(attr);
                   } else {
                       // write
                       return this.__attr(attr);
                   }
               } else {
                   return this.__attr(attr, val);
               }

               const type = typeof attr;
               if (type !== 'string' && type !== 'number') {
                   // allow only dev1, dev2, ... to be bound
                   if (Object.keys(attr).find(o => o && o.match(/^dev\d+(.val|.ack|.tc|.lc)+/))) {
                       return this.__attr(attr, val);
                   }
               } else if (arguments.length === 1 && attr) {
                   if (attr.match(/^dev\d+(.val|.ack|.tc|.lc)+/)) {
                       this.can.__reading(this, attr);
                       return this._get(attr);
                   }
                   return that.canStates[attr];
               } else {
                   console.log('This is ERROR!');
                   this._set(attr, val);
                   return this;
               }
           };

           // binding
           this.canStates.___bind = this.canStates.bind; // save original bind
           this.canStates.bind = function (id, callback) {
               return this.___bind(id, callback);
               // allow only dev1, dev2, ... to be bound
               //if (id && id.match(/^dev\d+(.val|.ack|.tc|.lc)+/)) {
               //    return this.___bind(id, callback);
               //}
               // console.log('ERROR: binding in edit mode is not allowed on ' + id);
           };

        }
        */
    }

    _setValue(id, val) {
        const oldVal = this.canStates.attr(`${id}.val`);

        // Send ack=false with new value to all widgets
        this.onStateChange(id, { val, ack: false });

        if (id.startsWith('local_')) {
            // update local variable state -> needed for binding, etc.
            return;
        }

        // save actual value to restore it in case of error
        this.props.socket.setState(id, { val, ack: false })
            .catch(error => {
                console.error(`Cannot set ${id} with "${val}: ${error}`);
                if (oldVal === undefined) {
                    this.canStates.removeAttr(`${id}.val`);
                    this.canStates.removeAttr(`${id}.q`);
                    this.canStates.removeAttr(`${id}.from`);
                    this.canStates.removeAttr(`${id}.ts`);
                    this.canStates.removeAttr(`${id}.lc`);
                    this.canStates.removeAttr(`${id}.ack`);
                } else {
                    // If error set value back, but we need generate the edge
                    this.canStates.attr(`${id}.val`, oldVal);
                }
            });
    }

    setValue = (id, val) => {
        if (!id) {
            console.log(`ID is null for val=${val}`);
            return;
        }

        // if no de-bounce running
        if (!this.statesDebounce[id]) {
            // send control command
            this._setValue(id, val);

            // Start timeout
            this.statesDebounce[id] = {
                timeout: setTimeout(() => {
                    if (this.statesDebounce[id]) {
                        if (this.statesDebounce[id].state !== null && this.statesDebounce[id].state !== undefined) {
                            this._setValue(id, this.statesDebounce[id].state);
                        }

                        delete this.statesDebounce[id];
                    }
                }, this.statesDebounceTime, id),
                state: null,
            };
        } else {
            // If some de-bounce running, change last value
            this.statesDebounce[id].state = val;
        }
    };

    // Following code is only required if legacy vis is used
    // eslint-disable-next-line camelcase
    /*
    UNSAFE_componentWillReceiveProps(nextProps) {
        const views = JSON.stringify(nextProps.views);
        if (views !== this.jsonViews) {
            this.jsonViews = views;
            this.vis.updateViews(JSON.parse(JSON.stringify(nextProps.views)));
        }

        if (nextProps.editMode !== this.state.editMode) {
            this.vis.setEditMode(nextProps.editMode);
            this.setState({ editMode: nextProps.editMode });
        }
    }
    */

    static async loadScriptsOfOneWidgetSet(widgetSet) {
        for (let i = 0; i < widgetSet.length; i++) {
            const { oldScript, newScript } = widgetSet[i];
            newScript.appendChild(document.createTextNode(oldScript.innerHTML));
            oldScript.parentNode.replaceChild(newScript, oldScript);

            await new Promise(resolve => {
                newScript.onload = resolve;
            });
        }
    }

    static loadedSources = [];

    static async setInnerHTML(elm, html) {
        elm.innerHTML = html;
        // we must load script one after another, to keep the order
        const scripts = Array.from(elm.querySelectorAll('script'));

        // load all scripts of one widget set sequentially and all groups of scripts in parallel
        const groups = {};

        for (let s = 0; s < scripts.length; s++) {
            const oldScript = scripts[s];
            const src = oldScript.getAttribute('src');
            if (src && VisEngine.loadedSources.includes(src)) {
                continue;
            }
            VisEngine.loadedSources.push(src);
            const newScript = document.createElement('script');

            let widgetSet = 'default';

            Array.from(oldScript.attributes)
                .forEach(attr => {
                    try {
                        if (attr.name === 'data-widgetset') {
                            widgetSet = attr.value;
                        } else {
                            newScript.setAttribute(attr.name, attr.value);
                        }
                    } catch (error) {
                        console.error(`WTF?? in ${attr.ownerElement.id}: ${error}`);
                    }
                });

            if (src) {
                groups[widgetSet] = groups[widgetSet] || [];
                groups[widgetSet].push({ newScript, oldScript });
            } else {
                newScript.appendChild(document.createTextNode(oldScript.innerHTML));
                oldScript.parentNode.replaceChild(newScript, oldScript);
            }
        }

        await Promise.all(Object.keys(groups)
            .map(widgetSet =>
                VisEngine.loadScriptsOfOneWidgetSet(groups[widgetSet])));
    }

    loadEditWords() {
        if (!this.props.runtime) {
            return new Promise(resolve => {
                const newScript = document.createElement('script');
                newScript.setAttribute('src', 'lib/js/visEditWords.js');
                newScript.onload = resolve;
                window.document.head.appendChild(newScript);
            });
        }

        return Promise.resolve();
    }

    async loadWidgets() {
        try {
            const data = await fetch('widgets.html');
            const text = await data.text();
            const div = document.createElement('div');
            document.body.appendChild(div);

            await VisEngine.setInnerHTML(div, text);

            this.props.onLoaded && this.props.onLoaded();
        } catch (error) {
            console.error(`Cannot load widgets: ${error}`);
            console.error(`Cannot load widgets: ${JSON.stringify(error.stack)}`);
        }
    }

    /*
    componentDidUpdate(prevProps, prevState, snapshot) {
        if (this.divRef.current) {
            this.vis.main(this.divRef.current);
        }
    }
    */

    updateWidget(view, wid, type, item, stateId, state) {
        if (this.widgetChangeHandlers[wid]) {
            this.widgetChangeHandlers[wid](type, item, stateId, state);
        }
    }

    registerChangeHandler = (wid, cb) => {
        if (this.props.editMode && this.widgetChangeHandlers[wid]) {
            console.error('Someone installs handler without to remove it!');
        }
        this.widgetChangeHandlers[wid] = cb;
    };

    unregisterChangeHandler = (wid, cb) => {
        if (this.widgetChangeHandlers[wid] === cb) {
            delete this.widgetChangeHandlers[wid];
        }
    };

    onUserCommand(instance, command, data) {
        const currentInstance = window.localStorage.getItem('visInstance');
        if (!instance || (instance !== currentInstance && instance !== 'FFFFFFFF' && !instance.includes('*'))) {
            return false;
        }
        if (this.props.editMode && command !== 'tts' && command !== 'playSound') {
            // show command
            if (command !== 'changedView') {
                window.alert(I18n.t('Received user command: %s', JSON.stringify({ instance, command, data })));
            }
            return true;
        }
        // external Commands
        switch (command) {
            case 'alert': {
                const [message, title, icon] = data.split(';');
                this.showMessage(message, title, icon);
                break;
            }
            case 'changedView':
                // Do nothing
                return false;
            case 'changeView': {
                const [project, view] = data.split('/');
                if (view) {
                    // detect actual project
                    if (project !== this.props.projectName) {
                        if (window.location.search.includes('runtime=')) {
                            document.location.href = `./?${project}&runtime=true#${view}`;
                        } else {
                            document.location.href = `./?${project}#${view}`;
                        }
                        return true;
                    }
                }

                window.vis.changeView(view || project, view || project);
                break;
            }
            case 'refresh':
            case 'reload':
                setTimeout(() =>
                    window.location.reload(), 1);
                break;
            case 'dialog':
            case 'dialogOpen':
                // noinspection JSJQueryEfficiency
                window.jQuery(`#${data}_dialog`).dialog('open');
                break;
            case 'dialogClose':
                // noinspection JSJQueryEfficiency
                window.jQuery(`#${data}_dialog`).dialog('close');
                break;
            case 'popup':
                window.open(data);
                break;
            case 'playSound':
                setTimeout(() => {
                    let href;

                    if (data && data.match(/^http(s)?:\/\//)) {
                        href = data;
                    } else {
                        href = `${window.location.protocol}//${window.location.hostname}:${window.location.port}${data}`;
                    }
                    // force read from server
                    href += `?${Date.now()}`;
                    if (this.refSound?.current) {
                        this.refSound.current.setAttribute('src', href);
                        this.refSound.current.setAttribute('muted', false);
                        this.refSound.current.play();
                    } else if (typeof Audio !== 'undefined') {
                        const snd = new Audio(href); // buffers automatically when created
                        snd.play();
                    } else {
                        // noinspection JSJQueryEfficiency
                        let $sound = this.$('#external_sound');
                        if (!$sound.length) {
                            this.$('body').append('<audio id="external_sound"></audio>');
                            $sound = this.$('#external_sound');
                        }
                        $sound.attr('src', href);
                        window.document.getElementById('external_sound').play();
                    }
                }, 1);
                break;
            case 'tts':
                if (typeof window.app !== 'undefined') {
                    window.app.tts(data);
                }
                break;
            default:
                this.conn.logError(`unknown external command ${command}`);
        }

        return false;
    }

    onStateChange = (id, state) => {
        // console.log(`[${new Date().toISOString()}] STATE_CHANGE: ${id}`);
        if (!id || state === null || typeof state !== 'object') {
            return;
        }

        if (id === this.idControlCommand) {
            if (state.ack) {
                return;
            }

            if (state.val &&
                typeof state.val === 'string' &&
                state.val[0] === '{' &&
                state.val[state.val.length - 1] === '}'
            ) {
                try {
                    state.val = JSON.parse(state.val);
                } catch (e) {
                    console.warn(`Command seems to be an object, but cannot parse it: ${state.val}`);
                }
            }

            // if command is an object {instance: 'iii', command: 'cmd', data: 'ddd'}
            if (state.val && state.val.instance) {
                if (this.onUserCommand(state.val.instance, state.val.command, state.val.data)) {
                    // clear state
                    this.props.socket.setState(id, { val: '', ack: true })
                        .catch(error => console.error(`Cannot reset ${id}: ${error}`));
                }
            } else if (this.onUserCommand(this._cmdInstance, state.val, this._cmdData)) {
                // clear state
                this.props.socket.setState(id, { val: '', ack: true })
                    .catch(error => console.error(`Cannot reset ${id}: ${error}`));
            }

            return;
        }

        if (id === this.idControlData) {
            this._cmdData = state.val;
            return;
        }

        if (id === this.idControlInstance) {
            this._cmdInstance = state.val;
            return;
        }

        // Do not update locals
        // not needed for local variables
        const o = {};
        // Check new model
        o[`${id}.val`] = state.val;

        if (state.ts !== undefined) {
            o[`${id}.ts`] = state.ts;
        }
        if (state.ack !== undefined) {
            o[`${id}.ack`] = state.ack;
        }
        if (state.lc !== undefined) {
            o[`${id}.lc`] = state.lc;
        }
        if (state.q !== undefined && state.q !== null) {
            o[`${id}.q`] = state.q;
        }

        try {
            this.canStates.attr(o);
        } catch (e) {
            this.props.socket.log(`Error: can't create states object for ${id}(${e}): ${JSON.stringify(e.stack)}`, 'error');
        }

        // process visibility
        this.linkContext.visibility[id]?.forEach(item => {
            // console.log('[' + new Date().toISOString() + '](' + item.widget + ') UPDATE_VISIBILITY: ' + id);
            this.updateWidget(item.view, item.widget, 'visibility', item);
        });

        // process signals
        this.linkContext.signals[id]?.forEach(item => {
            // console.log('[' + new Date().toISOString() + '](' + item.widget + ') UPDATE_SIGNAL: ' + id);
            this.updateWidget(item.view, item.widget, 'signal', item, id);
        });

        // Process last update
        this.linkContext.lastChanges[id]?.forEach(item => {
            // console.log('[' + new Date().toISOString() + '](' + item.widget + ') UPDATE_LAST_CHANGE: ' + id);
            this.updateWidget(item.view, item.widget, 'lastChange', item, id);
        });

        // Bindings on every element
        this.linkContext.bindings[id]?.forEach(item => this.updateWidget(item.view, item.widget, 'binding', item, id));

        // Inform other widgets, that do not support canJS
        this.onChangeCallbacks.forEach(item => {
            try {
                item.callback(item.arg, id, state.val, state.ack, state.ts);
            } catch (e) {
                this.props.socket.log(`Error: can't update states object for ${id}(${e}): ${JSON.stringify(e.stack)}`, 'error');
            }
        });
    };

    subscribe = IDs => {
        if (!Array.isArray(IDs)) {
            IDs = [IDs];
        }
        IDs.forEach(id => {
            if (this.subscribes[id]) {
                this.subscribes[id]++;
            } else {
                this.subscribes[id] = 1;
                console.log(`[${new Date().toISOString()}] +SUBSCRIBE: ${id}`);
                this.createCanState(id);
                if (!id.startsWith('local_')) {
                    this.props.socket.subscribeState(id, this.onStateChange);
                }
            }
        });
    };

    createCanState(id) {
        const _val = `${id}.val`;

        if (this.canStates[_val] === undefined || this.canStates[_val] === null) {
            const now = Date.now();
            const o = {};
            // set all together
            if (id.startsWith('local_')) {
                o[_val] = getUrlParameter(id);
            } else {
                o[_val] = 'null';
                o[`${id}.ts`] = now;
                o[`${id}.ack`] = false;
                o[`${id}.lc`] = now;
                o[`${id}.q`] = 0;
            }

            try {
                this.canStates.attr(o);
            } catch (e) {
                this.props.socket.log(`Error: can't create states object for ${id}(${e}): ${JSON.stringify(e.stack)}`, 'error');
            }
        }
    }

    unsubscribe = IDs => {
        if (!Array.isArray(IDs)) {
            IDs = [IDs];
        }

        IDs.forEach(id => {
            if (this.subscribes[id]) {
                this.subscribes[id]--;
                if (!this.subscribes[id]) {
                    console.log(`[${new Date().toISOString()}] -UNSUBSCRIBE: ${id}`);

                    if (!id.startsWith('local_')) {
                        this.props.socket.unsubscribeState(id, this.onStateChange);
                    }
                    delete this.subscribes[id];
                }
            }
        });
    };

    updateCustomScripts() {
        if (this.props.views) {
            if (!this.props.editMode) {
                if (this.props.views.___settings) {
                    if (this.scripts !== (this.props.views.___settings.scripts || '')) {
                        this.scripts = this.props.views.___settings.scripts || '';
                        let userScript = window.document.getElementById('#vis_user_scripts');
                        if (!userScript) {
                            userScript = window.document.createElement('script');
                            userScript.setAttribute('id', 'vis_user_scripts');
                            userScript.innerHTML = `try {
${this.scripts}
} catch (error) {
    console.error('Cannot execute user script: ' + error);
}`;
                            try {
                                window.document.head.appendChild(userScript);
                            } catch (error) {
                                console.error(`Cannot execute user script: ${error}`);
                            }
                        } else {
                            userScript.innerHTML = this.scripts;
                        }
                    }
                }
            } else if (this.scripts) {
            // unload scripts in edit mode
                this.scripts = null;
                let userScript = window.document.getElementById('#vis_user_scripts');
                if (userScript) {
                    userScript.remove();
                    userScript = null;
                }
            }
        }
    }

    static applyUserStyles(id, styles) {
        let styleEl = window.document.getElementById(id);
        if (styleEl) {
            styleEl.innerHTML = styles;
        } else {
            styleEl = window.document.createElement('style');
            styleEl.setAttribute('id', id);
            styleEl.innerHTML = styles;
            // insert common always first and then user css, as user CSS has bigger priority
            if (id === 'vis_common_user') {
                // try to find vis_user
                const styleUserEl = window.document.getElementById('vis_user');
                if (styleUserEl) {
                    window.document.head.insertBefore(styleEl, styleUserEl);
                } else {
                    window.document.head.appendChild(styleEl);
                }
            } else if (id === 'vis_user') {
                // try to find vis_user
                window.document.head.appendChild(styleEl);
            }
        }
    }

    updateCommonCss() {
        if (!this.visCommonCssLoaded || (this.props.visCommonCss && this.visCommonCssLoaded !== this.props.visCommonCss)) {
            this.visCommonCssLoaded = this.props.visCommonCss || true;
            if (this.props.visCommonCss) {
                VisEngine.applyUserStyles('vis_common_user', this.visCommonCssLoaded || '');
            } else {
                this.props.socket.readFile(this.props.adapterName, 'css/vis-common-user.css')
                    .then(file => {
                        if (file.mimeType) {
                            file = file.file;
                        }
                        this.visCommonCssLoaded = file || true;
                        VisEngine.applyUserStyles('vis_common_user', file || '');
                    })
                    .catch(e => console.warn(`Common user CSS not found: ${e}`));
            }
        }
    }

    updateUserCss() {
        if (!this.visUserCssLoaded || (this.props.visUserCss && this.visUserCssLoaded !== this.props.visUserCss)) {
            this.visUserCssLoaded = this.props.visUserCss || true;
            if (this.props.visUserCss) {
                VisEngine.applyUserStyles('vis_user', this.visUserCssLoaded || '');
            } else {
                this.props.socket.readFile(`${this.props.adapterName}.${this.props.instance}`, `${this.props.projectName}/vis-user.css`)
                    .then(file => {
                        if (file.mimeType) {
                            file = file.file;
                        }
                        this.visUserCssLoaded = file || true;
                        VisEngine.applyUserStyles('vis_user', file || '');
                    });
            }
        }
    }

    render() {
        if (!this.state.ready || this.props.widgetsLoaded < 2) {
            return null;
        }

        this.vis.editMode = this.props.editMode;
        this.vis.activeView = this.props.activeView;
        this.vis.views = this.props.views;

        this.updateCustomScripts();
        this.updateCommonCss();
        this.updateUserCss();

        const views = Object.keys(this.props.views).map(view => {
            if (view !== '___settings' && (view === this.props.activeView || this.props.views[view].settings?.alwaysRender)) {
                // return <div id="vis_container" ref={this.divRef} style={{ width: '100%', height: '100%' }} />;
                return <VisView
                    $$={window.$$}
                    activeView={this.props.activeView}
                    adapterName={this.props.adapterName}
                    allWidgets={this.allWidgets}
                    buildLegacyStructures={this.buildLegacyStructures}
                    can={this.can}
                    canStates={this.canStates}
                    dateFormat={this.vis.dateFormat}
                    disableInteraction={this.props.disableInteraction}
                    editMode={this.props.editMode}
                    editModeComponentClass={this.props.editModeComponentClass}
                    formatUtils={this.formatUtils}
                    instance={this.props.instance}
                    jQuery={window.jQuery}
                    key={view}
                    lang={this.props.lang}
                    linkContext={this.linkContext}
                    lockDragging={this.props.lockDragging}
                    onWidgetsChanged={this.props.runtime ? null : this.props.onWidgetsChanged}
                    project={this.props.project}
                    projectName={this.props.projectName}
                    registerEditorCallback={this.props.runtime ? null : this.props.registerEditorCallback}
                    selectedGroup={this.props.selectedGroup}
                    selectedWidgets={this.props.runtime ? null : this.props.selectedWidgets}
                    setSelectedGroup={this.props.setSelectedGroup}
                    setSelectedWidgets={this.props.runtime ? null : this.props.setSelectedWidgets}
                    setTimeInterval={this.setTimeInterval}
                    setTimeStart={this.setTimeStart}
                    setValue={this.setValue}
                    showWidgetNames={this.props.showWidgetNames}
                    socket={this.props.socket}
                    systemConfig={this.systemConfig}
                    theme={this.props.theme}
                    themeName={this.props.themeName}
                    themeType={this.props.themeType}
                    timeInterval={this.state.timeInterval}
                    timeStart={this.state.timeStart}
                    user={this.user}
                    userGroups={this.userGroups}
                    view={view}
                    views={this.props.views}
                    viewsActiveFilter={this.viewsActiveFilter}
                    widgetHint={this.props.widgetHint}
                />;
            }

            return null;
        });

        if (this.refSound) {
            views.push(<audio ref={this.refSound} key="__audio_145" id="external_sound" autoPlay muted></audio>);
        }

        views.push(this.renderMessageDialog());

        return views;
    }
}

VisEngine.propTypes = {
    socket: PropTypes.object.isRequired,
    views: PropTypes.object.isRequired, // project
    activeView: PropTypes.string,
    lang: PropTypes.string.isRequired,
    editMode: PropTypes.bool,
    editModeComponentClass: PropTypes.string,
    onLoaded: PropTypes.func,
    selectedWidgets: PropTypes.array,
    setSelectedWidgets: PropTypes.func,
    runtime: PropTypes.bool,
    onWidgetsChanged: PropTypes.func,
    onFontsUpdate: PropTypes.func,
    showWidgetNames: PropTypes.bool,
    registerEditorCallback: PropTypes.func,
    visCommonCss: PropTypes.string,
    visUserCss: PropTypes.string,
    setSelectedGroup: PropTypes.func,
    widgetHint: PropTypes.string,
    themeType: PropTypes.string,
    themeName: PropTypes.string,
    theme: PropTypes.object,
    onConfirmDialog: PropTypes.func,
    onShowCode: PropTypes.func,

    adapterName: PropTypes.string.isRequired,
    instance: PropTypes.number.isRequired,
    projectName: PropTypes.string.isRequired,
    adapterId: PropTypes.string.isRequired, // vis.0
};

export default VisEngine;
