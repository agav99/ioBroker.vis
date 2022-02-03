import I18n from '@iobroker/adapter-react/i18n';
import {
    Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
} from '@material-ui/core';

import { v4 as uuidv4 } from 'uuid';

import AddIcon from '@material-ui/icons/Add';
import EditIcon from '@material-ui/icons/Edit';
import DeleteIcon from '@material-ui/icons/Delete';
import FileIcon from '@material-ui/icons/InsertDriveFile';
import FolderIcon from '@material-ui/icons/Folder';
import VisibilityIcon from '@material-ui/icons/Visibility';
import VisibilityOffIcon from '@material-ui/icons/VisibilityOff';

const ViewsManage = props => {
    const createFolder = (name, parentId) => {
        const project = JSON.parse(JSON.stringify(props.project));
        project.___settings.folders.push({
            id: uuidv4(),
            name,
            parentId,
        });
        props.changeProject(project);
    };

    const deleteFolder = id => {
        const project = JSON.parse(JSON.stringify(props.project));
        project.___settings.folders.splice(project.___settings.folders.findIndex(folder => folder.id === id), 1);
        props.changeProject(project);
    };

    const renameFolder = (id, name) => {
        const project = JSON.parse(JSON.stringify(props.project));
        project.___settings.folders.find(folder => folder.id === id).name = name;
        props.changeProject(project);
    };

    const moveFolder = (id, parentId) => {
        const project = JSON.parse(JSON.stringify(props.project));
        project.___settings.folders.find(folder => folder.id === id).parentId = parentId;
        props.changeProject(project);
    };

    const renderViews = parentId => Object.keys(props.project)
        .filter(name => (parentId ? props.project[name].parentId === parentId : !props.project[name].parentId))
        .map((name, key) => <div key={key}>
            {props.openedViews.includes(name)
                ? <IconButton onClick={() => props.toggleView(name, false)}>
                    <VisibilityIcon />
                </IconButton>
                : <IconButton onClick={() => props.toggleView(name, true)}>
                    <VisibilityOffIcon />
                </IconButton>}
            <FileIcon />
            <span>{name}</span>
            <EditIcon />
            <DeleteIcon />
        </div>);

    const renderFolders = parentId => {
        const folders = props.project.___settings.folders
            .filter(folder => (parentId ? folder.parentId === parentId : !folder.parentId));
        return folders.map((folder, key) => <div key={key}>
            <FolderIcon />
            {folder.id}
            {folder.name}
            <AddIcon onClick={() => createFolder('folder', folder.id)} />
            <EditIcon />
            <DeleteIcon onClick={() => deleteFolder(folder.id)} />
            {renderViews(folder.id)}
            <div style={{ paddingLeft: 10 }}>
                {renderFolders(folder.id)}
            </div>
        </div>);
    };

    return <Dialog open={props.open} onClose={props.onClose}>
        <DialogTitle>{I18n.t('Manage views')}</DialogTitle>
        <DialogContent>
            <div>
                Folders
                <AddIcon onClick={() => createFolder('folder')} />
            </div>
            {renderFolders()}
            {renderViews()}
        </DialogContent>
        <DialogActions></DialogActions>
    </Dialog>;
};

export default ViewsManage;
