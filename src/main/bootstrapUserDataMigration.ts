import { app } from 'electron';

import { migrateElectronUserDataDirectory } from './utils/electronUserDataMigration';

export const earlyElectronUserDataMigrationResult = migrateElectronUserDataDirectory(app);
