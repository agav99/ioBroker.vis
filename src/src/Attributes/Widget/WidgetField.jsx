import {
    useEffect, useRef, useState,
} from 'react';
import PropTypes from 'prop-types';

import {
    Autocomplete, Box, Button, Checkbox, Fade, IconButton, Input, ListItemText,
    ListSubheader, MenuItem, Paper, Popper, Select, Slider, TextField, FormControl,
    FormHelperText, ListItemIcon,
} from '@mui/material';

import FileIcon from '@mui/icons-material/InsertDriveFile';
import ClearIcon from '@mui/icons-material/Clear';
import EditIcon from '@mui/icons-material/Edit';
import { FaFolderOpen as FolderOpenedIcon } from 'react-icons/fa';

import {
    I18n,
    IconPicker,
    Utils,
    Icon,
    TextWithIcon,
    ColorPicker,
    SelectID,
    SelectFile as SelectFileDialog,
} from '@iobroker/adapter-react-v5';

import TextDialog from './TextDialog';
import MaterialIconSelector from '../../Components/MaterialIconSelector';

const POSSIBLE_UNITS = ['px', '%', 'em', 'rem', 'vh', 'vw', 'vmin', 'vmax', 'ex', 'ch', 'cm', 'mm', 'in', 'pt', 'pc'];

function collectClasses() {
    const result = [];
    const sSheetList = document.styleSheets;
    for (let sSheet = 0; sSheet < sSheetList.length; sSheet++) {
        if (!document.styleSheets[sSheet]) {
            continue;
        }
        try {
            const ruleList = document.styleSheets[sSheet].cssRules;
            if (ruleList) {
                for (let rule = 0; rule < ruleList.length; rule++) {
                    if (!ruleList[rule].selectorText) {
                        continue;
                    }
                    const _styles = ruleList[rule].selectorText.split(',');
                    for (let s = 0; s < _styles.length; s++) {
                        const subStyles = _styles[s].trim().split(' ');
                        const _style = subStyles[subStyles.length - 1].replace('::before', '').replace('::after', '').replace(':before', '').replace(':after', '');

                        if (!_style || _style[0] !== '.' || _style.includes(':')) {
                            continue;
                        }

                        let name = _style;
                        name = name.replace(',', '');
                        name = name.replace(/^\./, '');

                        const val  = name;
                        name = name.replace(/^hq-background-/, '');
                        name = name.replace(/^hq-/, '');
                        name = name.replace(/^ui-/, '');
                        name = name.replace(/[-_]/g, ' ');

                        if (name.length > 0) {
                            name = name[0].toUpperCase() + name.substring(1);
                            let fff = document.styleSheets[sSheet].href;

                            if (fff && fff.includes('/')) {
                                fff = fff.substring(fff.lastIndexOf('/') + 1);
                            }

                            if (!result[val]) {
                                if (subStyles.length > 1) {
                                    result[val] = {
                                        name, file: fff, attrs: ruleList[rule].style, parentClass: subStyles[0].replace('.', ''),
                                    };
                                } else {
                                    result[val] = { name, file: fff, attrs: ruleList[rule].style };
                                }
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }
    }

    return result;
}

function getStylesOptions(options) {
    // Fill the list with styles
    const _internalList = window.collectClassesValue;

    options.filterName  = options.filterName  || '';
    options.filterAttrs = options.filterAttrs || '';
    options.filterFile  = options.filterFile  || '';

    let styles = {};

    if (options.styles) {
        styles = { ...options.styles };
    } else if (options.filterFile || options.filterName) {
        // IF filter defined
        const filters = options.filterName  ? options.filterName.split(' ')  : null;
        const attrs   = options.filterAttrs ? options.filterAttrs.split(' ') : null;
        const files   = options.filterFile  ? options.filterFile.split(' ')  : [''];

        Object.keys(_internalList).forEach(style =>
            files.forEach(file => {
                if (!options.filterFile ||
                        (_internalList[style].file && _internalList[style].file.includes(file))
                ) {
                    let isFound = !filters;

                    isFound = isFound || (!!filters.find(filter => style.includes(filter)));

                    if (isFound) {
                        isFound = !attrs;
                        if (!isFound) {
                            isFound = attrs.find(attr => {
                                const t = _internalList[style].attrs[attr];
                                return t || t === 0;
                            });
                        }
                    }

                    if (isFound) {
                        let n = _internalList[style].name;
                        if (options.removeName) {
                            n = n.replace(options.removeName, '');
                            n = n[0].toUpperCase() + n.substring(1).toLowerCase();
                        }
                        styles[style] = {
                            name:        n,
                            file:        _internalList[style].file,
                            parentClass: _internalList[style].parentClass,
                        };
                    }
                }
            }));
    } else {
        styles = { ...styles, ..._internalList };
    }

    return styles;
}

const getViewOptions = (project, options = [], parentId = null, level = 0) => {
    project.___settings.folders
        .filter(folder => (folder.parentId || null) === parentId)
        .forEach(folder => {
            options.push({
                type: 'folder',
                folder,
                level: level + 1,
            });

            getViewOptions(project, options, folder.id, level + 1);
        });

    const keys = Object.keys(project)
        .filter(view => (project[view].parentId || null) === parentId && !view.startsWith('__'));

    keys.forEach(view => {
        options.push({
            type: 'view',
            view,
            level: level + 1,
        });
    });

    return options;
};

// Optimize translation
const wordsCache = {};

const t = (word, ...args) => {
    const hash = `${word}_${args.join(',')}`;
    if (!wordsCache[hash]) {
        wordsCache[hash] = I18n.t(word, ...args);
    }
    return wordsCache[hash];
};

const WidgetField = props => {
    const [idDialog, setIdDialog] = useState(false);

    const [objectCache, setObjectCache] = useState(null);

    const {
        field,
        widget,
        adapterName,
        instance,
        projectName,
        isDifferent,
        error,
        disabled,
    } = props;

    let customLegacyComponent = null;

    if (field.type?.startsWith('custom,')) {
        const options = field.type.split(',');
        options.shift();
        const funcs = options[0].split('.');
        if (funcs[0] === 'vis') funcs.shift();
        if (funcs[0] === 'binds') funcs.shift();

        window._   = window.vis._; // for old widgets, else lodash overwrites it
        window.vis.activeWidgets = [...props.selectedWidgets];
        window.vis.activeView = props.selectedView;

        if (funcs.length === 1) {
            if (typeof window.vis.binds[funcs[0]] === 'function') {
                try {
                    customLegacyComponent = window.vis.binds[funcs[0]](field.name, options);
                } catch (e) {
                    console.error(`vis.binds.${funcs.join('.')}: ${e}`);
                }
            } else {
                console.log(`No function: vis.binds.${funcs.join('.')}`);
            }
        } else if (funcs.length === 2) {
            if (window.vis.binds[funcs[0]] && typeof window.vis.binds[funcs[0]][funcs[1]] === 'function') {
                try {
                    customLegacyComponent = window.vis.binds[funcs[0]][funcs[1]](field.name, options);
                } catch (e) {
                    console.error(`vis.binds.${funcs.join('.')}: ${e}`);
                }
            } else {
                console.log(`No function: vis.binds.${funcs.join('.')}`);
            }
        } else if (funcs.length === 3) {
            if (window.vis.binds[funcs[0]] && window.vis.binds[funcs[0]][funcs[1]] && typeof window.vis.binds[funcs[0]][funcs[1]][funcs[2]] === 'function') {
                try {
                    customLegacyComponent = window.vis.binds[funcs[0]][funcs[1]][funcs[2]](field.name, options);
                } catch (e) {
                    console.error(`vis.binds.${funcs.join('.')}: ${e}`);
                }
            } else {
                console.log(`No function: vis.binds.${funcs.join('.')}`);
            }
        } else if (!funcs.length) {
            console.log('Function name is too short: vis.binds');
        } else {
            console.log(`Function name is too long: vis.binds.${funcs.join('.')}`);
        }
    }

    const [cachedValue, setCachedValue] = useState('');
    const [instances, setInstances] = useState([]);

    const cacheTimer = useRef(null);
    const refCustom = useRef();

    let onChangeTimeout;

    const applyValue = newValues => {
        const project = JSON.parse(JSON.stringify(props.project));
        props.selectedWidgets.forEach((selectedWidget, i) => {
            const value = Array.isArray(newValues) ? newValues[i] : newValues;

            const data = props.isStyle
                ? project[props.selectedView].widgets[selectedWidget].style
                : project[props.selectedView].widgets[selectedWidget].data;

            data[field.name] = value;

            if (field.onChangeFunc && props.widgetType) {
                try {
                    window.vis.binds[props.widgetType.set][field.onChangeFunc](
                        selectedWidget,
                        props.selectedView,
                        value,
                        field.name,
                        props.isStyle,
                        props.isStyle ? widget.style[field.name] : widget.data[field.name],
                    );
                } catch (e) {
                    console.error(`Cannot call onChangeFunc: ${e}`);
                }
            }
            if (field.onChange) {
                field.onChange(field, JSON.parse(JSON.stringify(data)), newData => {
                    const _project = JSON.parse(JSON.stringify(props.project));
                    _project[props.selectedView].widgets[selectedWidget].data = newData;
                    onChangeTimeout && clearTimeout(onChangeTimeout);
                    onChangeTimeout = setTimeout(() => {
                        onChangeTimeout = null;
                        props.changeProject(_project);
                    }, 100);
                }, props.socket);
            }
        });

        props.changeProject(project);
    };

    const change = changeValue => {
        if (Array.isArray(changeValue) || field.immediateChange) {
            // apply immediately
            applyValue(changeValue);
        } else {
            setCachedValue(changeValue);
            cacheTimer.current && clearTimeout(cacheTimer.current);
            cacheTimer.current = setTimeout(() => {
                cacheTimer.current = null;
                applyValue(changeValue);
            }, 300);
        }
    };

    let propValue = props.isStyle ? widget.style[field.name] : widget.data[field.name];
    if (propValue === undefined) {
        propValue = null;
    }

    useEffect(() => {
        if (propValue !== undefined) {
            setCachedValue(propValue);
        }
        if (field.type === 'instance') {
            if (field.adapter === '_dataSources') {
                props.socket.getAdapterInstances('')
                    .then(_instances => {
                        const inst = _instances
                            .filter(obj => obj.common.getHistory)
                            .map(obj => ({
                                id: obj._id.replace('system.adapter.', ''),
                                idShort: obj._id.split('.').pop(),
                                name: obj.common.name,
                                icon: obj.common.icon,
                            }));
                        setInstances(inst);
                    });
            } else {
                props.socket.getAdapterInstances(field.adapter || '')
                    .then(_instances => {
                        const inst = _instances.map(obj => obj._id.replace('system.adapter.', ''));
                        setInstances(inst);
                    });
            }
        }
    }, [propValue]);

    let value = cachedValue;
    if (value === undefined || value === null) {
        if (field.default) {
            value = field.default;
        } else {
            value = '';
        }
    }

    if (!window.collectClassesValue) {
        window.collectClassesValue = collectClasses();
    }

    const textRef = useRef();
    const [textDialogFocused, setTextDialogFocused] = useState(false);
    const [textDialogEnabled, setTextDialogEnabled] = useState(true);

    const urlPopper = (!field.type || field.type === 'number' || field.type === 'password' || field.type === 'image') && !disabled ? <Popper
        open={textDialogFocused && textDialogEnabled && !!value && value.toString().startsWith(window.location.origin)}
        anchorEl={textRef.current}
        placement="bottom"
        transition
    >
        {({ TransitionProps }) => <Fade {...TransitionProps} timeout={350}>
            <Paper>
                <Button
                    style={{ textTransform: 'none' }}
                    onClick={() => change(`.${value.toString().slice(window.location.origin.length)}`)}
                >
                    {I18n.t('Replace to ')}
                    {`.${value.toString().slice(window.location.origin.length)}`}
                </Button>
                <IconButton size="small" onClick={() => setTextDialogEnabled(false)}>
                    <ClearIcon fontSize="small" />
                </IconButton>
            </Paper>
        </Fade>}
    </Popper> : null;

    // part for customLegacyComponent
    useEffect(() => {
        if (customLegacyComponent && refCustom.current && typeof customLegacyComponent.init === 'function') {
            customLegacyComponent.init.call(refCustom.current, field.name, propValue);
        }
    }, []);

    if (customLegacyComponent) {
        // console.log(customLegacyComponent.input);
        // eslint-disable-next-line react/no-danger
        return <div ref={refCustom} dangerouslySetInnerHTML={{ __html: customLegacyComponent.input }} />;
    }

    if (field.type === 'id' || field.type === 'hid' || field.type === 'history') {
        if (value && (!objectCache || value !== objectCache._id)) {
            props.socket.getObject(value)
                .then(objectData =>
                    setObjectCache(objectData))
                .catch(() => setObjectCache(null));
        }
        if (objectCache && !value) {
            setObjectCache(null);
        }

        // Find filter
        let customFilter = null;
        let filters = null;
        if (idDialog && !disabled) {
            if (field.type === 'hid' || field.type === 'history') {
                customFilter = { common: { custom: '_dataSources' } };
            } else if (
                typeof field.filter === 'string' &&
                field.filter !== 'chart' &&
                field.filter !== 'channel' &&
                field.filter !== 'device'
            ) {
                // detect role
                if (field.filter.includes('.') || field.filter.startsWith('level') || field.filter.startsWith('value')) {
                    filters = { role: field.filter };
                } else {
                    customFilter = { type: field.filter };
                }
            } else if (field.filter) {
                customFilter = field.filter;
            }
        }

        return <>
            <TextField
                variant="standard"
                fullWidth
                placeholder={isDifferent ? t('different') : null}
                InputProps={{
                    classes: { input: Utils.clsx(props.classes.clearPadding, props.classes.fieldContent) },
                    endAdornment: <Button disabled={disabled} size="small" onClick={() => setIdDialog(true)}>...</Button>,
                }}
                error={!!error}
                helperText={typeof error === 'string' ? I18n.t(error) : null}
                disabled={disabled}
                value={value}
                onChange={e => change(e.target.value)}
            />
            <div style={{ fontStyle: 'italic' }}>
                {objectCache ? (typeof objectCache.common.name === 'object' ? objectCache.common.name[I18n.lang] : objectCache.common.name) : null}
            </div>
            {idDialog && !disabled ? <SelectID
                selected={value}
                onOk={selected => change(selected)}
                onClose={() => setIdDialog(false)}
                socket={props.socket}
                types={field.filter === 'chart' || field.filter === 'channel' || field.filter === 'device' ? [field.filter] : null}
                filters={filters}
                expertMode={field.filter === 'chart' ? true : undefined}
                customFilter={customFilter}
            /> : null}
        </>;
    }

    if (field.type === 'checkbox') {
        return <FormControl
            error={!!error}
            component="fieldset"
            variant="standard"
        >
            <Checkbox
                disabled={disabled}
                checked={!!value}
                classes={{ root: Utils.clsx(props.classes.fieldContent, props.classes.clearPadding) }}
                size="small"
                onChange={e => change(e.target.checked)}
            />
            {typeof error === 'string' ? <FormHelperText>{I18n.t(error)}</FormHelperText> : null}
        </FormControl>;
    }

    if (field.type === 'image') {
        let _value;
        if (idDialog) {
            _value = value;
            if (_value.startsWith('../')) {
                _value = _value.substring(3);
            } else if (_value.startsWith('_PRJ_NAME/')) {
                _value = _value.replace('_PRJ_NAME/', `../${adapterName}.${instance}/${projectName}/`);
            }
        }

        return <>
            <TextField
                variant="standard"
                fullWidth
                placeholder={isDifferent ? t('different') : null}
                error={!!error}
                helperText={typeof error === 'string' ? I18n.t(error) : null}
                disabled={disabled}
                InputProps={{
                    classes: { input: Utils.clsx(props.classes.clearPadding, props.classes.fieldContent) },
                    endAdornment: <Button disabled={disabled} size="small" onClick={() => setIdDialog(true)}>...</Button>,
                }}
                ref={textRef}
                value={value}
                onFocus={() => setTextDialogFocused(true)}
                onBlur={() => setTextDialogFocused(false)}
                onChange={e => change(e.target.value)}
            />
            {urlPopper}
            {idDialog ? <SelectFileDialog
                title={t('Select file')}
                onClose={() => setIdDialog(false)}
                allowUpload
                allowDownload
                allowCreateFolder
                allowDelete
                allowView
                showToolbar
                imagePrefix="../"
                selected={_value}
                filterByType="images"
                onSelect={(selected, isDoubleClick) => {
                    const projectPrefix = `${adapterName}.${instance}/${projectName}/`;
                    if (selected.startsWith(projectPrefix)) {
                        selected = `_PRJ_NAME/${selected.substring(projectPrefix.length)}`;
                    } else if (selected.startsWith('/')) {
                        selected = `..${selected}`;
                    } else if (!selected.startsWith('.')) {
                        selected = `../${selected}`;
                    }
                    change(selected);
                    isDoubleClick && setIdDialog(false);
                }}
                onOk={selected => {
                    const projectPrefix = `${adapterName}.${instance}/${projectName}/`;
                    if (selected.startsWith(projectPrefix)) {
                        selected = `_PRJ_NAME/${selected.substring(projectPrefix.length)}`;
                    } else if (selected.startsWith('/')) {
                        selected = `..${selected}`;
                    } else if (!selected.startsWith('.')) {
                        selected = `../${selected}`;
                    }
                    change(selected);
                    setIdDialog(false);
                }}
                socket={props.socket}
            /> : null}
        </>;
    }

    if (field.type === 'dimension') {
        const m = (value || '').toString().match(/^(-?[,.0-9]+)([a-z%]*)$/);
        let customValue = !m;
        let _value;
        let unit;
        if (m) {
            _value = m[1];
            unit = m[2] || 'px';
            // eslint-disable-next-line no-restricted-properties
            if (!window.isFinite(_value) || (m[2] && !POSSIBLE_UNITS.includes(m[2]))) {
                customValue = true;
            }
        }

        return <TextField
            variant="standard"
            fullWidth
            placeholder={isDifferent ? t('different') : null}
            error={!!error}
            helperText={typeof error === 'string' ? I18n.t(error) : null}
            disabled={disabled}
            InputProps={{
                classes: { input: Utils.clsx(props.classes.clearPadding, props.classes.fieldContent) },
                endAdornment: !isDifferent && !customValue ? <Button
                    size="small"
                    disabled={disabled}
                    title={t('Convert %s to %s', unit, unit === '%' ? 'px' : '%')}
                    onClick={() => {
                        if (unit !== '%') {
                            props.onPxToPercent(props.selectedWidgets, field.name, newValues => change(newValues[0]));
                        } else {
                            props.onPercentToPx(props.selectedWidgets, field.name, newValues => change(newValues[0]));
                        }
                    }}
                >
                    {unit}
                </Button> : null,
            }}
            value={value}
            onChange={e => change(e.target.value)}
        />;
    }

    if (field.type === 'color') {
        return <ColorPicker
            error={!!error}
            helperText={typeof error === 'string' ? I18n.t(error) : null}
            disabled={disabled}
            value={value}
            className={props.classes.fieldContentColor}
            onChange={color => change(color)}
            openAbove
        />;
    }

    if (field.type === 'eff_opt') {
        return <>
            {field.type}
            /
            {value}
        </>;
    }

    if (field.type === 'slider') {
        return <div style={{ display: 'flex' }}>
            <Slider
                disabled={disabled}
                className={props.classes.fieldContentSlider}
                size="small"
                onChange={(e, newValue) => change(newValue)}
                value={typeof value === 'number' ? value : 0}
                min={field.min}
                max={field.max}
                step={field.step}
                marks={field.marks}
                valueLabelDisplay={field.valueLabelDisplay}
            />
            <Input
                className={props.classes.fieldContentSliderInput}
                value={value}
                disabled={disabled}
                size="small"
                onChange={e => change(parseFloat(e.target.value))}
                classes={{ input: Utils.clsx(props.classes.clearPadding, props.classes.fieldContent) }}
                inputProps={{
                    step: field.step,
                    min: field.min,
                    max: field.max,
                    type: 'number',
                }}
            />
        </div>;
    }

    if (field.type === 'select' || field.type === 'nselect' || field.type === 'fontname' || field.type === 'effect' || field.type === 'widget') {
        let { options } = field;

        if (field.type === 'fontname') {
            options = props.fonts;
        }

        if (field.type === 'effect') {
            options = [
                '',
                'show',
                'blind',
                'bounce',
                'clip',
                'drop',
                'explode',
                'fade',
                'fold',
                'highlight',
                'puff',
                'pulsate',
                'scale',
                'shake',
                'size',
                'slide',
            ];
        }

        if (field.type === 'widget') {
            options = Object.keys(props.project[props.selectedView].widgets);
            if (field.tpl) {
                options = options.filter(id => props.project[props.selectedView].widgets[id].tpl === field.tpl);
            }
            options.unshift('');
            options = options.map(id => ({
                value: id,
                label: `${id || t('attr_none')}${id ? ` (${props.project[props.selectedView].widgets[id].name || props.project[props.selectedView].widgets[id].tpl})` : ''}`,
            }));
        }

        const withIcons = !!options.find(item => item && item.icon);

        return <Select
            variant="standard"
            disabled={disabled}
            value={value}
            placeholder={isDifferent ? t('different') : null}
            defaultValue={field.default}
            classes={{
                root: props.classes.clearPadding,
                select: Utils.clsx(props.classes.fieldContent, props.classes.clearPadding),
            }}
            onChange={e => change(e.target.value)}
            renderValue={_value => {
                if (typeof options[0] === 'object') {
                    const item = options.find(o => o.value === _value);
                    const text = item ? (field.type === 'select' && !field.noTranslation ? t(item.label) : item.label) : _value;
                    if (withIcons && item.icon) {
                        return <>
                            <Icon src={item.icon} />
                            <span style={item.color ? { color: item.color } : null}>{text}</span>
                        </>;
                    }
                    return text;
                }
                return field.type === 'select' && !field.noTranslation ? t(_value) : _value;
            }}
            fullWidth
        >
            {options.map((selectItem, i) => <MenuItem
                value={typeof selectItem === 'object' ? selectItem.value : selectItem}
                key={`${typeof selectItem === 'object' ? selectItem.value : selectItem}_${i}`}
                style={{ fontFamily: field.type === 'fontname' ? selectItem : null }}
            >
                {selectItem.icon ? <ListItemIcon>
                    <Icon src={selectItem.icon} style={{ width: 24 }} />
                </ListItemIcon>
                    :
                    (withIcons ? <ListItemIcon><div style={{ width: 24 }} /></ListItemIcon> : null)}
                <ListItemText>
                    {selectItem === '' ?
                        <i>{t('attr_none')}</i>
                        :
                        (field.type === 'select' && !field.noTranslation ?
                            (typeof selectItem === 'object' ?
                                <span style={selectItem.color ? { color: selectItem.color } : null}>{field.noTranslation ? selectItem.label : t(selectItem.label)}</span> : t(selectItem)
                            ) : (typeof selectItem === 'object' ?
                                <span style={selectItem.color ? { color: selectItem.color } : null}>{selectItem.label}</span> : selectItem
                            ))}
                </ListItemText>
            </MenuItem>)}
        </Select>;
    }

    if (field.type === 'select-views') {
        const options = getViewOptions(props.project, [], null, 0, true)
            .filter(option => option.type === 'folder' || option.view !== props.selectedView);

        return <Select
            variant="standard"
            disabled={disabled}
            value={value || []}
            placeholder={isDifferent ? t('different') : null}
            multiple={field.multiple !== false}
            renderValue={selected => (field.multiple !== false ? selected.join(', ') : selected)}
            classes={{
                root: props.classes.clearPadding,
                select: Utils.clsx(props.classes.fieldContent, props.classes.clearPadding),
            }}
            onChange={e => {
                if (field.multiple !== false) {
                    change(e.target.value.filter(selectValue => selectValue !== null));
                } else {
                    change(e.target.value);
                }
            }}
            fullWidth
        >
            {options.map((option, key) => (option.type === 'view' ?
                <MenuItem
                    value={option.view}
                    key={key.toString()}
                    style={{ paddingLeft: option.level * 16, lineHeight: '36px' }}
                >
                    <FileIcon style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    <span style={{ verticalAlign: 'middle' }}>{field.multiple !== false ? <Checkbox checked={(value || []).includes(option.view)} /> : null}</span>
                    <ListItemText primary={option.view} style={{ verticalAlign: 'middle' }} />
                </MenuItem>
                :
                <ListSubheader key={key} style={{ paddingLeft: option.level * 16 }} className={props.classes.listFolder}>
                    <FolderOpenedIcon className={props.classes.iconFolder} />
                    <span style={{ fontSize: '1rem' }}>{option.folder.name}</span>
                </ListSubheader>))}
        </Select>;
    }

    if (field.type === 'groups') {
        return <Select
            variant="standard"
            disabled={disabled}
            value={value || []}
            placeholder={isDifferent ? t('different') : null}
            multiple
            renderValue={selected => <div style={{ display: 'flex' }}>
                {props.groups
                    .filter(group => selected.includes(group._id.split('.')[2]))
                    .map((group, key) =>
                        <span key={key} style={{ padding: '4px 4px' }}>
                            <TextWithIcon
                                value={group._id}
                                t={t}
                                lang={I18n.getLanguage()}
                                list={[group]}
                            />
                        </span>)}
            </div>}
            classes={{
                root: props.classes.clearPadding,
                select: Utils.clsx(props.classes.fieldContent, props.classes.clearPadding),
            }}
            onChange={e => change(e.target.value)}
            fullWidth
        >
            {props.groups.map((group, i) => <MenuItem
                value={group._id.split('.')[2]}
                key={`${group._id.split('.')[2]}_${i}`}
            >
                <Checkbox
                    disabled={disabled}
                    checked={(value || []).includes(group._id.split('.')[2])}
                />
                <TextWithIcon
                    value={group._id}
                    t={t}
                    lang={I18n.getLanguage()}
                    list={[group]}
                />
            </MenuItem>)}
        </Select>;
    }

    if (field.type === 'auto' || field.type === 'class' || field.type === 'filters')  {
        let options = field.options;
        if (field.type === 'class') {
            options = window.collectClassesValue.filter(cssClass => cssClass.match(/^vis-style-/));
        } else
        if (field.type === 'filters') {
            options = window.vis ? window.vis.updateFilter() : [];
            options.unshift('');
        }

        return <Autocomplete
            freeSolo
            fullWidth
            disabled={disabled}
            placeholder={isDifferent ? t('different') : null}
            options={options || []}
            inputValue={value || ''}
            value={value || ''}
            onInputChange={(e, inputValue) => change(inputValue)}
            onChange={(e, inputValue) => change(inputValue)}
            classes={{ input: Utils.clsx(props.classes.clearPadding, props.classes.fieldContent) }}
            renderOption={field.name === 'font-family' ?
                (optionProps, option) => (
                    <div style={{ fontFamily: option }} {...optionProps}>{option}</div>) : null}
            renderInput={params => <TextField
                variant="standard"
                error={!!error}
                helperText={typeof error === 'string' ? I18n.t(error) : null}
                disabled={disabled}
                {...params}
            />}
        />;
    }

    if (field.type === 'views')  {
        const options = getViewOptions(props.project);

        return <Autocomplete
            freeSolo
            fullWidth
            disabled={disabled}
            placeholder={isDifferent ? t('different') : null}
            options={options || []}
            inputValue={value || ''}
            value={value || ''}
            onInputChange={(e, inputValue) => {
                if (typeof inputValue === 'object' && inputValue !== null) {
                    inputValue = inputValue.type === 'view' ? inputValue.view : inputValue.folder.name;
                }
                change(inputValue);
            }}
            onChange={(e, inputValue) => {
                if (typeof inputValue === 'object' && inputValue !== null) {
                    inputValue = inputValue.type === 'view' ? inputValue.view : inputValue.folder.name;
                }
                change(inputValue);
            }}
            classes={{ input: Utils.clsx(props.classes.clearPadding, props.classes.fieldContent) }}
            getOptionLabel={option => {
                if (typeof option === 'string') {
                    return option;
                }
                return option.type === 'view' ? option.view : option.folder.name;
            }}
            getOptionDisabled={option => option.type === 'folder'}
            renderOption={(optionProps, option) =>
                (option.type === 'view' ?
                    <Box
                        component="li"
                        style={{ paddingLeft: option.level * 16 }}
                        {...optionProps}
                        key={`view${option.view}`}
                    >
                        <FileIcon />
                        {t(option.view)}
                    </Box>
                    :
                    <Box
                        component="li"
                        style={{ paddingLeft: option.level * 16 }}
                        {...optionProps}
                        key={`folder${option.folder.id}`}
                    >
                        <FolderOpenedIcon style={{ color: '#00dc00', fontSize: 20 }} />
                        {option.folder.name}
                    </Box>)}
            renderInput={params => <TextField
                variant="standard"
                error={!!error}
                helperText={typeof error === 'string' ? I18n.t(error) : null}
                disabled={disabled}
                {...params}
                inputProps={{ ...params.inputProps }}
            />}
        />;
    }

    if (field.type === 'style') {
        const stylesOptions = getStylesOptions({
            filterFile:  field.filterFile,
            filterName:  field.filterName,
            filterAttrs: field.filterAttrs,
            removeName:  field.removeName,
        });

        return <Select
            variant="standard"
            value={value}
            disabled={disabled}
            placeholder={isDifferent ? t('different') : null}
            defaultValue={field.default}
            classes={{
                root: props.classes.clearPadding,
                select: Utils.clsx(props.classes.fieldContent, props.classes.clearPadding),
            }}
            onChange={e => change(e.target.value)}
            renderValue={selectValue => <div className={props.classes.backgroundClass}>
                <span className={stylesOptions[selectValue]?.parentClass}>
                    <span className={`${props.classes.backgroundClassSquare} ${selectValue}`} />
                </span>
                {t(stylesOptions[selectValue]?.name)}
            </div>}
            fullWidth
        >
            {Object.keys(stylesOptions).map((styleName, i) => <MenuItem
                value={styleName}
                key={`${styleName}_${i}`}
            >
                <span className={stylesOptions[styleName].parentClass}>
                    <span className={`${props.classes.backgroundClassSquare} ${styleName}`} />
                </span>
                {t(stylesOptions[styleName].name)}
            </MenuItem>)}
        </Select>;
    }

    if (field.type === 'custom') {
        if (field.component) {
            try {
                return field.component(
                    field,
                    widget.data,
                    newData => {
                        const _project = JSON.parse(JSON.stringify(props.project));
                        props.selectedWidgets.forEach(selectedWidget => {
                            Object.keys(newData)
                                .forEach(attr => {
                                    if (newData[attr] === null) {
                                        delete _project[props.selectedView].widgets[selectedWidget].data[attr];
                                    } else {
                                        _project[props.selectedView].widgets[selectedWidget].data[attr] = newData[attr];
                                    }
                                });
                        });
                        props.changeProject(_project);
                    },
                    props.socket,
                    props.selectedWidgets.length === 1 ? props.selectedWidgets[0] : props.selectedWidgets,
                    props.selectedView,
                    props.project,
                );
            } catch (e) {
                console.error(`Cannot render custom field ${field.name}: ${e}`);
            }
        } else {
            return <>
                {field.type}
                /
                {value}
            </>;
        }
    }

    if (field.type === 'instance') {
        return <Select
            variant="standard"
            value={value}
            disabled={disabled}
            placeholder={isDifferent ? t('different') : null}
            defaultValue={field.default}
            classes={{
                root: props.classes.clearPadding,
                select: Utils.clsx(props.classes.fieldContent, props.classes.clearPadding),
            }}
            onChange={e => change(e.target.value)}
            renderValue={selectValue => selectValue}
            fullWidth
        >
            {instances.map(_instance => <MenuItem
                value={field.isShort ? _instance.idShort : _instance.id}
                key={_instance.id}
            >
                <ListItemIcon>
                    <img src={`./${_instance.name}.admin/${_instance.icon}`} width="24" height="24" alt={_instance.name} />
                </ListItemIcon>
                <ListItemText>{field.isShort ? _instance.idShort : _instance.id}</ListItemText>
            </MenuItem>)}
        </Select>;
    }

    if (field.type === 'icon') {
        return <IconPicker
            label="Icon"
            t={I18n.t}
            lang={I18n.getLanguage()}
            value={value}
            disabled={disabled}
            onChange={fileBlob => change(fileBlob)}
            previewClassName={props.classes.iconPreview}
        />;
    }

    if (field.type === 'icon64') {
        return <div style={{ textAlign: 'right', width: '100%' }}>
            <Button
                variant={value ? 'outlined' : undefined}
                color={value ? 'grey' : undefined}
                onClick={() => setIdDialog(true)}
            >
                {value ? <Icon src={value} style={{ width: 36, height: 36 }} /> : '...'}
            </Button>
            {idDialog &&
                <MaterialIconSelector
                    value={value}
                    onClose={icon => {
                        setIdDialog(false);
                        if (icon !== null) {
                            change(icon);
                        }
                    }}
                />}
        </div>;
    }

    if (field.type === 'text' || field.type === 'html' || field.type === 'json') {
        return <>
            <TextField
                size="small"
                placeholder={isDifferent ? t('different') : null}
                variant="standard"
                value={value}
                multiline={!field.noButton}
                fullWidth
                error={!!error}
                disabled={disabled}
                helperText={typeof error === 'string' ? I18n.t(error) : null}
                onChange={e => change(e.target.value)}
                InputProps={{
                    endAdornment: field.noButton ? null : <Button
                        disabled={disabled}
                        size="small"
                        onClick={() => setIdDialog(true)}
                    >
                        <EditIcon />
                    </Button>,
                    classes: {
                        input: Utils.clsx(props.classes.clearPadding, props.classes.fieldContent),
                    },
                }}
                rows={2}
            />
            {idDialog ? <TextDialog
                open={!0}
                value={value}
                onChange={newValue => change(newValue)}
                onClose={() => setIdDialog(false)}
                themeType={props.themeType}
                type={field.type}
            /> : null}
        </>;
    }

    if (!field.type || field.type === 'number' || field.type === 'password') {
        return <>
            <TextField
                variant="standard"
                fullWidth
                ref={textRef}
                error={!!error}
                disabled={disabled}
                helperText={typeof error === 'string' ? I18n.t(error) : null}
                onFocus={() => setTextDialogFocused(true)}
                onBlur={() => setTextDialogFocused(false)}
                placeholder={isDifferent ? t('different') : null}
                InputProps={{
                    classes: { input: Utils.clsx(props.classes.clearPadding, props.classes.fieldContent) },
                }}
                value={value}
                onChange={e => {
                    if (field.type === 'number') {
                        const _value = parseFloat(e.target.value);
                        if (field.min !== undefined) {
                            if (_value < field.min) {
                                change(field.min);
                                return;
                            }
                        }
                        if (field.max !== undefined) {
                            if (_value > field.max) {
                                change(field.max);
                                return;
                            }
                        }
                        change(_value);
                    } else {
                        change(e.target.value);
                    }
                }}
                type={field.type ? field.type : 'text'}
                // eslint-disable-next-line react/jsx-no-duplicate-props
                inputProps={{
                    min: field.min,
                    max: field.max,
                    step: field.step,
                }}
            />
            {urlPopper}
        </>;
    }

    return `${field.type}/${value}`;
};

WidgetField.propTypes = {
    adapterName: PropTypes.string.isRequired,
    changeProject: PropTypes.func,
    classes: PropTypes.object,
    field: PropTypes.object.isRequired,
    fonts: PropTypes.array,
    groups: PropTypes.array,
    instance: PropTypes.number.isRequired,
    isDifferent: PropTypes.bool,
    isStyle: PropTypes.bool,
    onPercentToPx: PropTypes.func,
    onPxToPercent: PropTypes.func,
    project: PropTypes.object,
    projectName: PropTypes.string.isRequired,
    selectedView: PropTypes.string,
    selectedWidgets: PropTypes.array,
    socket: PropTypes.object,
    widget: PropTypes.object.isRequired,
    error: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
    disabled: PropTypes.bool,
    widgetType: PropTypes.object,
};

export default WidgetField;
