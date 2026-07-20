import { installIdbMigration } from '$lib/net/idbMigrate';

export const prerender = true;
export const ssr = false;

// ssr=false: this module only ever runs in the browser. Arm the one-time
// IndexedDB import before anything touches the save API.
installIdbMigration();
