import 'colors';
import { config, error, Origami, requireLib, success } from 'origami-core-lib';
import Server from 'origami-core-server';

const bird = require('origami-bird');


const handleErr = (err: Error) => {
    console.log(err);

    error(err);
    process.exit();
};


process.on('unhandledRejection', handleErr);
process.on('uncaughtException', handleErr);

export default class OrigamiInstance {
    server: Server | null = null;

    private _readyFuncs: Function[] = [];
    private _config: Origami.Config | null = null;
    private _store: object | null = null;
    private _admin: Function | null = null;
    private _ready: boolean = false;


    constructor(config: Origami.Config) {
        this._init(config);
    }


    ready(func: Function) {
        if (this._ready) func();
        else this._readyFuncs.push(func);
    }


    private async _init(c: Origami.Config) {
        const origamiFile = (await config.read()) || {};
        const defaults = {
            admin: 'zen'
        };

        const combined = {...defaults, ...origamiFile, ...c};
        config.validate(combined);
        this._config = combined;


        this._setup();

        if (process.env.LOG_VERBOSE) bird();
    }


    private async _setup() {
        await this._setupStore();
        await this._setupAdmin();
        await this._setupServer();

        this._ready = true;
        this._readyFuncs.forEach(f => f());
    }


    private async _setupStore() {
        if (!this._config) return error('Not initialized');
        const c = this._config;

        const store = await requireLib(c.store.type, __dirname, `origami-store-`);

        const s = this._store = new store(c.store);
        await s.connect();
        success('', 'Connected to store', c.store.type.cyan);
    }


    private async _setupAdmin() {
        if (!this._config) return error('Not initialized');

        const {admin} = this._config;
        this._admin = await requireLib(admin, __dirname, `origami-admin-`);
        success('', 'Using admin interface', admin.cyan);
    }


    private async _setupServer() {
        if (!this._config || !this._store || !this._admin) return error('Not initialized');
        const s = this.server = await new Server(
            this._config.server,
            this._store
        );

        this._admin(this.server, {});

        // Setup the plugins for the server
        if (this._config.plugins) config.setupPlugins(this._config, this.server);

        // Setup the apps for the server
        if (this._config.apps) config.setupApps(this._config, this.server);

        // Setup the resources for the server API
        if (this._config.resources) config.setupResources(this._config, this.server);

        // Setup the controllers for the server API
        if (this._config.controllers) config.setupControllers(this._config, this.server);

        // Serve the app
        s.serve();
    }
}
