import React, { useRef } from 'react';
import './App.scss';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';

import withStyles from '@mui/styles/withStyles';

import GenericApp from '@iobroker/adapter-react-v5/GenericApp';
import Loader from '@iobroker/adapter-react-v5/Components/Loader';
import {
    IconButton,
    Tab, Tabs, Tooltip,
} from '@mui/material';

import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import CodeIcon from '@mui/icons-material/Code';
import CodeOffIcon from '@mui/icons-material/CodeOff';
import PlayIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';

import ReactSplit, { SplitDirection, GutterTheme } from '@devbookhq/splitter';

import I18n from '@iobroker/adapter-react-v5/i18n';
import { DndProvider, useDrop } from 'react-dnd';
import { TouchBackend } from 'react-dnd-touch-backend';
import { HTML5Backend } from 'react-dnd-html5-backend';
import Attributes from './Attributes';
import Widgets from './Widgets';
import Toolbar from './Toolbar';
import CreateFirstProjectDialog from './CreateFirstProjectDialog';
import VisEngine from './Vis/index';
import { DndPreview, isTouchDevice } from './Utils';

const styles = theme => ({
    block: {
        overflow: 'auto',
        height: 'calc(100vh - 100px)',
        padding: '0px 8px',
    },
    canvas: {
        overflow: 'auto',
        height: 'calc(100vh - 138px)',
    },
    menu: {
        display: 'flex',
        alignItems: 'center',
    },
    app: {
        backgroundColor: theme.palette.background.default,
        color: theme.palette.text.primary,
    },
    tabsContainer: {
        display: 'flex',
        alignItems: 'center',
    },
    viewTabs: theme.classes.viewTabs,
    viewTab: theme.classes.viewTab,
});

// temporary disable i18n warnings
I18n.t = (word, ...args) => {
    const translation = I18n.translations[I18n.lang];
    if (translation) {
        const w = translation[word];
        if (w) {
            word = w;
        }
    }
    for (const arg of args) {
        word = word.replace('%s', arg);
    }
    return word;
};

const ViewDrop = props => {
    const targetRef = useRef();

    const [{ CanDrop, isOver }, drop] = useDrop(() => ({
        accept: ['widget'],
        drop(item, monitor) {
            console.log(monitor.getClientOffset());
            console.log(targetRef.current.getBoundingClientRect());
            console.log(item);
            props.addWidget(item.widgetType.name, monitor.getClientOffset().x - targetRef.current.getBoundingClientRect().x, monitor.getClientOffset().y - targetRef.current.getBoundingClientRect().y);
        },
        canDrop: (item, monitor) => true,
        collect: monitor => ({
            isOver: monitor.isOver(),
            CanDrop: monitor.canDrop(),
        }),
    }), []);

    return <div
        ref={drop}
        style={isOver && CanDrop ? {
            borderStyle: 'dashed', borderRadius: 4, borderWidth: 1, height: '100%', width: '100%',
        } : { height: '100%', width: '100%' }}
    >
        <div ref={targetRef} style={{ height: '100%', width: '100%' }}>
            {props.children}
        </div>
    </div>;
};

class App extends GenericApp {
    constructor(props) {
        const extendedProps = { ...props };
        extendedProps.translations = {
            en: require('./i18n/en'),
            de: require('./i18n/de'),
            ru: require('./i18n/ru'),
            pt: require('./i18n/pt'),
            nl: require('./i18n/nl'),
            fr: require('./i18n/fr'),
            it: require('./i18n/it'),
            es: require('./i18n/es'),
            pl: require('./i18n/pl'),
            'zh-cn': require('./i18n/zh-cn'),
        };

        extendedProps.sentryDSN = window.sentryDSN;

        super(props, extendedProps);

        this.visEngineHandlers = {};
    }

    setStateAsync(newState) {
        return new Promise(resolve => this.setState(newState, () => resolve()));
    }

    componentDidMount() {
        super.componentDidMount();
        let runtime = false;

        if (window.location.search.includes('runtime') || window.location.pathname.endsWith('edit.html')) {
            runtime = true;
        }

        this.setState({
            runtime,
            projectName: 'main',
            viewsManage: false,
            projectsDialog: false,
            createFirstProjectDialog: false,
            selectedWidgets: [],
            showCode: window.localStorage.getItem('showCode') === 'true',
            editMode: true,
            widgetsLoaded: false,
            fonts: [],
            history: [],
            historyCursor: 0,
            ...this.state,
        });

        window.addEventListener('hashchange', this.onHashChange, false);
        window.addEventListener('beforeunload', e => {
            if (this.state.needSave) {
                e.returnValue = I18n.t('Are you sure? Some data didn\'t save.');
                return I18n.t('Are you sure? Some data didn\'t save.');
            }
            return null;
        });
    }

    componentWillUnmount() {
        // eslint-disable-next-line no-unused-expressions
        this.savingTimer && clearTimeout(this.savingTimer);
        this.savingTimer = null;
        super.componentWillUnmount();
        window.removeEventListener('hashchange', this.onHashChange, false);
    }

    onHashChange = () => {
        this.changeView(decodeURIComponent(window.location.hash.slice(1)))
            .then(() => {});
    }

    loadProject = async projectName => {
        let file;
        try {
            file = await this.socket.readFile('vis.0', `${projectName}/vis-views.json`);
            if (typeof file === 'object') {
                file = file.data;
            }
        } catch (err) {
            console.warn(`Cannot read project file vis-views.json: ${err}`);
            file = '{}';
        }
        const project = JSON.parse(file);
        project.___settings = project.___settings || {};
        project.___settings.folders = project.___settings.folders || [];
        let selectedView;
        if (decodeURIComponent(window.location.hash.slice(1)).length) {
            selectedView = decodeURIComponent(window.location.hash.slice(1));
        } else if (Object.keys(project).includes(window.localStorage.getItem('selectedView'))) {
            selectedView = window.localStorage.getItem('selectedView');
        } else {
            selectedView = Object.keys(project).find(view => !view.startsWith('__')) || '';
        }
        let openedViews;
        if (window.localStorage.getItem('openedViews')) {
            openedViews = JSON.parse(window.localStorage.getItem('openedViews'));
        } else {
            openedViews = [selectedView];
        }

        const len = openedViews.length;

        // fix project
        Object.keys(project).forEach(view => {
            if (project[view].widgets) {
                Object.keys(project[view].widgets).forEach(wid => {
                    if (!project[view].widgets[wid]) {
                        delete project[view].widgets[wid];
                        return;
                    }
                    if (!project[view].widgets[wid].data) {
                        project[view].widgets[wid].data = {};
                    }
                    if (!project[view].widgets[wid].style) {
                        project[view].widgets[wid].style = {};
                    }

                    if (project[view].widgets[wid].data.members && !Array.isArray(project[view].widgets[wid].data.members)) {
                        project[view].widgets[wid].data.members = [];
                    }

                    if (project[view].widgets[wid].data.members) {
                        project[view].widgets[wid].data.members.forEach((_wid, i) =>
                            project[view].widgets[wid].data.members[i] = _wid.replace(/\s/g, '_'));
                    }

                    if (wid.includes(' ')) {
                        const newWid = wid.replace(/\s/g, '_');
                        const widget = project[view].widgets[wid];
                        delete project[view].widgets[wid];
                        project[view].widgets[newWid] = widget;
                    }
                });
            }
        });

        for (let i = len - 1; i >= 0; i--) {
            if (!project[openedViews[i]]) {
                openedViews.splice(i, 1);
            }
        }

        if (len && !openedViews.length) {
            const view = Object.keys(project).find(_view => _view !== '___settings');
            if (view) {
                openedViews[0] = view;
            }
        }

        // check that selectedView and openedViews exist
        if (!project[selectedView]) {
            selectedView = openedViews[0] || '';
        } else
        if (openedViews && !openedViews.includes(selectedView)) {
            selectedView = openedViews[0];
        }

        const groups = await this.socket.getGroups();

        window.localStorage.setItem('projectName', projectName);

        await this.setStateAsync({
            project,
            history: [project],
            historyCursor: 0,
            visProject: project,
            openedViews,
            projectName,
            groups,
        });

        await this.changeView(selectedView);
    }

    async onConnectionReady() {
        if (window.localStorage.getItem('projectName')) {
            this.loadProject(window.localStorage.getItem('projectName'));
        } else {
            // take first project
            this.socket.readDir('vis.0', '')
                .then(projects => this.loadProject(projects[0].file));
        }

        await this.refreshProjects();

        const user = await this.socket.getCurrentUser();
        const currentUser = await this.socket.getObject(`system.user.${user || 'admin'}`);
        this.setState({
            currentUser,
            selectedView: '',
            splitSizes: window.localStorage.getItem('splitSizes')
                ? JSON.parse(window.localStorage.getItem('splitSizes'))
                : [20, 60, 20],
        });
    }

    refreshProjects = () => this.socket.readDir('vis.0', '')
        .then(projects => this.setState({
            projects: projects.filter(dir => dir.isDir).map(dir => dir.file),
            createFirstProjectDialog: !projects.length,
        }));

    setViewsManage = newValue => this.setState({ viewsManage: newValue })

    setProjectsDialog = newValue => this.setState({ projectsDialog: newValue })

    changeView = async selectedView => {
        const selectedWidgets = JSON.parse(window.localStorage.getItem(
            `${this.state.projectName}.${selectedView}.widgets`,
        ) || '[]') || [];

        // Check that all selectedWidgets exist
        for (let i = selectedWidgets.length - 1; i >= 0; i--) {
            if (!this.state.project[selectedView] || !this.state.project[selectedView].widgets || !this.state.project[selectedView].widgets[selectedWidgets[i]]) {
                selectedWidgets.splice(i, 1);
            }
        }

        const newState = {
            selectedView,
            selectedWidgets,
        };

        if (!this.state.openedViews || !this.state.openedViews.includes(selectedView)) {
            const openedViews = this.state.openedViews ? [...this.state.openedViews] : [];
            openedViews.push(selectedView);
            newState.openedViews = openedViews;
        }

        window.localStorage.setItem('selectedView', selectedView);

        if (window.location.hash !== '#view') {
            window.location.hash = selectedView;
        }

        await this.setStateAsync(newState);
    }

    addWidget = async (widgetType, x, y) => {
        const project = JSON.parse(JSON.stringify(this.state.project));
        const widgets = project[this.state.selectedView].widgets;
        let newKey = 0;
        Object.keys(widgets).forEach(name => {
            const matches = name.match(/^w([0-9]+)$/);
            if (matches) {
                if (parseInt(matches[1]) >= newKey) {
                    newKey = parseInt(matches[1]) + 1;
                }
            }
        });
        newKey = `w${newKey.toString().padStart(6, 0)}`;
        widgets[newKey] = {
            tpl: widgetType,
            data: {},
            style:{
                left: `${x}px`,
                top: `${y}px`,
            },
        };
        await this.changeProject(project);
        await this.setStateAsync({ selectedWidgets: [newKey] });
    }

    undo = async () => {
        await this.changeProject(this.state.history[this.state.historyCursor - 1], true);
        await this.setStateAsync({
            historyCursor: this.state.historyCursor - 1,
        });
    }

    redo = async () => {
        await this.changeProject(this.state.history[this.state.historyCursor + 1], true);
        await this.setStateAsync({
            historyCursor: this.state.historyCursor + 1,
        });
    }

    changeProject = async (project, isHistory) => {
        const newState = { project, needSave: true };
        if (!isHistory) {
            let history = JSON.parse(JSON.stringify(this.state.history));
            let historyCursor = this.state.historyCursor;
            if (historyCursor !== history.length - 1) {
                history = history.slice(0, historyCursor + 1);
            }
            history.push(project);
            if (history.length > 50) {
                history.shift();
            }
            historyCursor = history.length - 1;
            newState.history = history;
            newState.historyCursor = historyCursor;
        }

        await this.setStateAsync(newState);

        // save changes after 1 second
        // eslint-disable-next-line no-unused-expressions
        this.savingTimer && clearTimeout(this.savingTimer);
        this.savingTimer = setTimeout(async () => {
            this.savingTimer = null;
            await this.socket.writeFile64('vis.0', `${this.state.projectName}/vis-views.json`, JSON.stringify(this.state.project, null, 2));
            this.setState({ needSave: false });
        }, 1000);

        this.visTimer && clearTimeout(this.visTimer);
        this.visTimer = setTimeout(() => {
            this.visTimer = null;
            this.setState({ visProject: project });
        }, 300);
    }

    addProject = async projectName => {
        try {
            const project = {
                ___settings: {
                    folders: [],
                },
                DemoView: {
                    name: 'DemoView',
                    settings: {
                        style: {},
                    },
                    widgets: {},
                    activeWidgets: {},
                },
            };
            await this.socket.writeFile64('vis.0', `${projectName}/vis-views.json`, JSON.stringify(project));
            await this.socket.writeFile64('vis.0', `${projectName}/vis-user.css`, '');
            await this.refreshProjects();
            await this.loadProject(projectName);
        } catch (e) {
            console.error(e);
        }
    }

    renameProject = async (fromProjectName, toProjectName) => {
        try {
            // const files = await this.socket.readDir('vis.0', fromProjectName);
            await this.socket.rename('vis.0', fromProjectName, toProjectName);
            await this.refreshProjects();
            if (this.state.projectName === fromProjectName) {
                await this.loadProject(toProjectName);
            }
        } catch (e) {
            // eslint-disable-next-line no-alert
            window.alert(`Cannot rename: ${e}`);
            console.error(e);
        }
    }

    deleteProject = async projectName => {
        try {
            await this.socket.deleteFolder('vis.0', projectName);
            await this.refreshProjects();
            if (this.state.projectName === projectName) {
                await this.loadProject(this.state.projects[0]);
            }
        } catch (e) {
            console.error(e);
        }
    }

    toggleView = (view, isShow) => {
        const openedViews = JSON.parse(JSON.stringify(this.state.openedViews));
        if (isShow && !openedViews.includes(view)) {
            openedViews.push(view);
        }
        if (!isShow && openedViews.includes(view)) {
            openedViews.splice(openedViews.indexOf(view), 1);
        }
        window.localStorage.setItem('openedViews', JSON.stringify(openedViews));
        this.setState({ openedViews }, async () => {
            if (!openedViews.includes(this.state.selectedView)) {
                await this.changeView(openedViews[0]);
            }
        });
    }

    setSelectedWidgets = (selectedWidgets, cb) => {
        this.setState({ selectedWidgets }, () => cb && cb());
        window.localStorage.setItem(`${this.state.projectName}.${this.state.selectedView}.widgets`, JSON.stringify(selectedWidgets));
    }

    toggleCode = () => {
        const oldShowCode = this.state.showCode;
        this.setState({ showCode: !oldShowCode });
        window.localStorage.setItem('showCode', JSON.stringify(!oldShowCode));
    }

    onWidgetsChanged = (data, view, viewSettings) => {
        this.tempProject = this.tempProject || JSON.parse(JSON.stringify(this.state.project));
        if (data) {
            data.forEach(item => Object.assign(this.tempProject[item.view].widgets[item.wid].style, item.style));
        }

        // settings of view are changed
        if (view && viewSettings) {
            Object.keys(viewSettings).forEach(attr => {
                if (viewSettings[attr] === null) {
                    delete this.tempProject[view].settings[attr];
                } else {
                    this.tempProject[view].settings[attr] = viewSettings[attr];
                }
            });
        }

        this.changeTimer && clearTimeout(this.changeTimer);

        // collect changes from all widgets
        this.changeTimer = setTimeout(() => {
            this.changeTimer = null;
            this.changeProject(this.tempProject);
            this.tempProject = null;
        }, 200);
    }

    onFontsUpdate = fonts => {
        this.setState({ fonts });
    };

    cssClone = (attr, cb) => {
        if (this.visEngineHandlers[this.state.selectedView] && this.visEngineHandlers[this.state.selectedView].onStealStyle) {
            this.visEngineHandlers[this.state.selectedView].onStealStyle(attr, cb);
        } else {
            cb && cb(attr, null); // cancel selection
        }
    }

    onPxToPercent = (wids, attr, cb) => {
        if (this.visEngineHandlers[this.state.selectedView] && this.visEngineHandlers[this.state.selectedView].onPxToPercent) {
            this.visEngineHandlers[this.state.selectedView].onPxToPercent(wids, attr, cb);
        } else {
            cb && cb(wids, attr, null); // cancel selection
        }
    }

    onPercentToPx = (wids, attr, cb) => {
        if (this.visEngineHandlers[this.state.selectedView] && this.visEngineHandlers[this.state.selectedView].onPercentToPx) {
            this.visEngineHandlers[this.state.selectedView].onPercentToPx(wids, attr, cb);
        } else {
            cb && cb(wids, attr, null); // cancel selection
        }
    }

    registerCallback = (name, view, cb) => {
        // console.log(`${!cb ? 'Unr' : 'R'}egister handler for ${view}: ${name}`);

        if (cb) {
            this.visEngineHandlers[view] = this.visEngineHandlers[view] || {};
            this.visEngineHandlers[view][name] = cb;
        } else {
            delete this.visEngineHandlers[view][name];
            if (!Object.keys(this.visEngineHandlers[view]).length) {
                delete this.visEngineHandlers[view];
            }
        }
    };

    render() {
        if (!this.state.loaded || !this.state.project || !this.state.groups) {
            return <StyledEngineProvider injectFirst>
                <ThemeProvider theme={this.state.theme}>
                    <Loader theme={this.state.themeType} />
                </ThemeProvider>
            </StyledEngineProvider>;
        }

        const visEngine = <VisEngine
            activeView={this.state.selectedView || ''}
            editMode={!this.state.runtime && this.state.editMode}
            runtime={this.state.runtime}
            socket={this.socket}
            lang={this.socket.systemLang}
            views={this.state.visProject}
            adapterName={this.adapterName}
            instance={this.instance}
            selectedWidgets={this.state.selectedWidgets}
            setSelectedWidgets={this.setSelectedWidgets}
            onLoaded={() => this.setState({ widgetsLoaded: true })}
            onWidgetsChanged={this.onWidgetsChanged}
            projectName={this.state.projectName}
            onFontsUpdate={this.state.runtime ? null : this.onFontsUpdate}
            registerEditorCallback={this.state.runtime ? null : this.registerCallback}
        />;

        if (this.state.runtime) {
            return visEngine;
        }

        return <StyledEngineProvider injectFirst>
            <ThemeProvider theme={this.state.theme}>
                <div className={this.props.classes.app}>
                    <Toolbar
                        classes={{}}
                        selectedView={this.state.selectedView}
                        project={this.state.project}
                        changeView={this.changeView}
                        changeProject={this.changeProject}
                        openedViews={this.state.openedViews}
                        toggleView={this.toggleView}
                        socket={this.socket}
                        projects={this.state.projects}
                        loadProject={this.loadProject}
                        projectName={this.state.projectName}
                        addProject={this.addProject}
                        renameProject={this.renameProject}
                        deleteProject={this.deleteProject}
                        needSave={this.state.needSave}
                        currentUser={this.state.currentUser}
                        themeName={this.state.themeName}
                        toggleTheme={() => this.toggleTheme()}
                        refreshProjects={this.refreshProjects}
                        viewsManage={this.state.viewsManage}
                        setViewsManage={this.setViewsManage}
                        projectsDialog={this.state.projects && this.state.projects.length ? this.state.projectsDialog : !this.state.createFirstProjectDialog}
                        setProjectsDialog={this.setProjectsDialog}
                        selectedWidgets={this.state.selectedWidgets}
                        setSelectedWidgets={this.setSelectedWidgets}
                        history={this.state.history}
                        historyCursor={this.state.historyCursor}
                        undo={this.undo}
                        redo={this.redo}
                        deleteWidgets={this.deleteWidgets}
                        adapterName={this.adapterName}
                        instance={this.instance}
                    />
                    <div>
                        <DndProvider backend={isTouchDevice() ? TouchBackend : HTML5Backend}>
                            <DndPreview />
                            <ReactSplit
                                direction={SplitDirection.Horizontal}
                                initialSizes={this.state.splitSizes}
                                minWidths={[240, 0, 240]}
                                onResizeFinished={(gutterIdx, newSizes) => {
                                    this.setState({ splitSizes: newSizes });
                                    window.localStorage.setItem('splitSizes', JSON.stringify(newSizes));
                                }}
                                theme={this.state.themeName === 'dark' ? GutterTheme.Dark : GutterTheme.Light}
                                gutterClassName={this.state.themeName === 'dark' ? 'Dark visGutter' : 'Light visGutter'}
                            >
                                <div className={this.props.classes.block}>
                                    <Widgets
                                        classes={{}}
                                        widgetsLoaded={this.state.widgetsLoaded}
                                    />
                                </div>
                                <div>
                                    <div className={this.props.classes.tabsContainer}>
                                        <Tooltip title={I18n.t('Toggle code')}>
                                            <IconButton onClick={() => this.toggleCode()} size="small">
                                                {this.state.showCode ? <CodeOffIcon /> : <CodeIcon />}
                                            </IconButton>
                                        </Tooltip>
                                        {!this.state.showCode ? <Tooltip title={I18n.t('Toggle runtime')}>
                                            <IconButton onClick={() => this.setState({ editMode: !this.state.editMode })} size="small">
                                                {this.state.editMode ? <PlayIcon style={{ color: 'green' }} /> : <StopIcon style={{ color: 'red' }} /> }
                                            </IconButton>
                                        </Tooltip> : null}
                                        <Tooltip title={I18n.t('Show view')}>
                                            <IconButton onClick={() => this.setViewsManage(true)} size="small">
                                                <AddIcon />
                                            </IconButton>
                                        </Tooltip>
                                        <Tabs
                                            value={this.state.selectedView}
                                            className={this.props.classes.viewTabs}
                                            variant="scrollable"
                                            scrollButtons="auto"
                                        >
                                            {
                                                Object.keys(this.state.project)
                                                    .filter(view => !view.startsWith('__'))
                                                    .filter(view => this.state.openedViews.includes(view))
                                                    .map(view => <Tab
                                                        component="span"
                                                        label={<span>
                                                            {view}
                                                            <Tooltip title={I18n.t('Hide')}>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={e => {
                                                                        e.stopPropagation();
                                                                        this.toggleView(view, false);
                                                                    }}
                                                                >
                                                                    <CloseIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </span>}
                                                        className={this.props.classes.viewTab}
                                                        value={view}
                                                        onClick={() => this.changeView(view)}
                                                        key={view}
                                                    />)
                                            }
                                        </Tabs>
                                    </div>
                                    <div className={this.props.classes.canvas}>
                                        {this.state.showCode
                                            ? <pre>
                                                {JSON.stringify(this.state.project, null, 2)}
                                            </pre> : null}
                                        <ViewDrop addWidget={this.addWidget}>
                                            <div
                                                id="vis-react-container"
                                                style={{
                                                    position: 'relative',
                                                    display: this.state.showCode ? 'none' : 'block',
                                                    width: '100%',
                                                    height: '100%',
                                                }}
                                            >
                                                { visEngine }
                                            </div>
                                        </ViewDrop>
                                    </div>
                                </div>
                                <div className={this.props.classes.block}>
                                    <Attributes
                                        classes={{}}
                                        selectedView={this.state.selectedView}
                                        groups={this.state.groups}
                                        project={this.state.project}
                                        changeProject={this.changeProject}
                                        openedViews={this.state.openedViews}
                                        projectName={this.state.projectName}
                                        selectedWidgets={this.state.selectedWidgets}
                                        widgetsLoaded={this.state.widgetsLoaded}
                                        socket={this.socket}
                                        themeName={this.state.themeName}
                                        fonts={this.state.fonts}
                                        adapterName={this.adapterName}
                                        instance={this.instance}
                                        cssClone={this.cssClone}
                                        onPxToPercent={this.onPxToPercent}
                                        onPercentToPx={this.onPercentToPx}
                                    />
                                </div>
                            </ReactSplit>
                        </DndProvider>
                    </div>
                </div>
                <CreateFirstProjectDialog
                    open={this.state.createFirstProjectDialog}
                    onClose={() => this.setState({ createFirstProjectDialog: false })}
                    addProject={this.addProject}
                />
            </ThemeProvider>
        </StyledEngineProvider>;
    }
}

export default withStyles(styles)(App);
