/**
 * Storage Module
 * Handles all interactions with IndexedDB for storing collections and items.
 */

const DB_NAME = 'SmartWebCollectorDB';
const DB_VERSION = 2;
const STORE_COLLECTIONS = 'collections';
const STORE_VERSIONS = 'versions';
const STORE_AUDITS = 'audits';

class StorageManager {
    constructor() {
        this.db = null;
    }

    /**
     * Opens the IndexedDB database.
     * @returns {Promise<IDBDatabase>}
     */
    async open() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error('Storage: Database error', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Collections Store (Existing)
                if (!db.objectStoreNames.contains(STORE_COLLECTIONS)) {
                    const store = db.createObjectStore(STORE_COLLECTIONS, { keyPath: 'id' });
                    store.createIndex('created', 'created', { unique: false });
                }

                // Versions Store (New in v2)
                if (!db.objectStoreNames.contains(STORE_VERSIONS)) {
                    const store = db.createObjectStore(STORE_VERSIONS, { keyPath: 'versionId' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('parentVersionId', 'parentVersionId', { unique: false });
                }

                // Audits Store (New in v2)
                if (!db.objectStoreNames.contains(STORE_AUDITS)) {
                    const store = db.createObjectStore(STORE_AUDITS, { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('versionId', 'versionId', { unique: false });
                }
            };
        });
    }

    /**
     * Saves a collection to the database.
     * @param {Object} collection - The collection object to save.
     * @returns {Promise<string>} - The ID of the saved collection.
     */
    async saveCollection(collection) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_COLLECTIONS], 'readwrite');
            const store = transaction.objectStore(STORE_COLLECTIONS);

            // Ensure ID exists
            if (!collection.id) {
                collection.id = crypto.randomUUID();
            }
            if (!collection.created) {
                collection.created = new Date().toISOString();
            }
            if (!collection.items) {
                collection.items = [];
            }

            const request = store.put(collection);

            request.onsuccess = () => resolve(collection.id);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Retrieves all collections.
     * @returns {Promise<Array>}
     */
    async getCollections() {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_COLLECTIONS], 'readonly');
            const store = transaction.objectStore(STORE_COLLECTIONS);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Retrieves a specific collection by ID.
     * @param {string} id 
     * @returns {Promise<Object>}
     */
    async getCollection(id) {
        if (!id) return null;
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_COLLECTIONS], 'readonly');
            const store = transaction.objectStore(STORE_COLLECTIONS);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Deletes a collection by ID.
     * @param {string} id 
     * @returns {Promise<void>}
     */
    async deleteCollection(id) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_COLLECTIONS], 'readwrite');
            const store = transaction.objectStore(STORE_COLLECTIONS);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Adds an item to a specific collection.
     * @param {string} collectionId 
     * @param {Object} item 
     * @returns {Promise<void>}
     */
    async addItemToCollection(collectionId, item) {
        const collection = await this.getCollection(collectionId);
        if (!collection) throw new Error('Collection not found');

        if (!item.id) item.id = crypto.randomUUID();
        if (!item.timestamp) item.timestamp = new Date().toISOString();

        collection.items.push(item);
        await this.saveCollection(collection);
    }

    /**
     * Moves an item from one collection to another.
     * @param {string} itemId - ID of the item to move
     * @param {string} fromCollectionId - Source collection ID
     * @param {string} toCollectionId - Destination collection ID
     * @returns {Promise<void>}
     */
    async moveItemToCollection(itemId, fromCollectionId, toCollectionId) {
        const fromCollection = await this.getCollection(fromCollectionId);
        const toCollection = await this.getCollection(toCollectionId);

        if (!fromCollection) throw new Error('Source collection not found');
        if (!toCollection) throw new Error('Destination collection not found');

        // Find the item in the source collection
        const itemIndex = fromCollection.items.findIndex(item => item.id === itemId);
        if (itemIndex === -1) throw new Error('Item not found in source collection');

        // Remove from source
        const [item] = fromCollection.items.splice(itemIndex, 1);

        // Add to destination
        toCollection.items.push(item);

        // Save both collections
        await this.saveCollection(fromCollection);
        await this.saveCollection(toCollection);
    }

    // ==========================================
    // VERSIONING (GIT-STYLE)
    // ==========================================

    /**
     * Creates an immutable snapshot of the current state.
     * @param {string} commitMessage - Human-readable message for this version.
     * @param {string|null} parentVersionId - The ID of the parent version (null if root).
     * @returns {Promise<string>} - The new versionId.
     */
    async createSnapshot(commitMessage, parentVersionId = null) {
        await this.open();
        const collections = await this.getCollections();

        const versionId = crypto.randomUUID();
        const timestamp = new Date().toISOString();

        const versionRecord = {
            versionId,
            parentVersionId,
            timestamp,
            commitMessage,
            snapshotData: collections // Store full state
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_VERSIONS], 'readwrite');
            const store = transaction.objectStore(STORE_VERSIONS);
            const request = store.add(versionRecord);

            request.onsuccess = () => resolve(versionId);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Restores a specific version state.
     * CRITICAL: This does NOT overwrite history. It creates a NEW version (child of the restored one).
     * @param {string} versionId - The ID of the version to restore.
     * @returns {Promise<string>} - The NEW versionId created by this restore operation.
     */
    async restoreVersion(versionId) {
        await this.open();

        // 1. Fetch the target version
        const targetVersion = await new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_VERSIONS], 'readonly');
            const store = transaction.objectStore(STORE_VERSIONS);
            const request = store.get(versionId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });

        if (!targetVersion) {
            throw new Error(`Version ${versionId} not found.`);
        }

        // 2. Overwrite current state with snapshot data
        const collections = targetVersion.snapshotData;

        // Use a transaction to clear and repopulate collections
        const transaction = this.db.transaction([STORE_COLLECTIONS], 'readwrite');
        const store = transaction.objectStore(STORE_COLLECTIONS);

        await new Promise((resolve, reject) => {
            // clear() is fastest for full restore
            const clearReq = store.clear();

            clearReq.onsuccess = () => {
                // Bulk add back
                let pending = collections.length;
                if (pending === 0) resolve();

                collections.forEach(col => {
                    const addReq = store.put(col);
                    addReq.onsuccess = () => {
                        pending--;
                        if (pending === 0) resolve();
                    };
                    addReq.onerror = (e) => reject(e.target.error);
                });
            };
            clearReq.onerror = (e) => reject(e.target.error);
        });

        // 3. Create a NEW version commit for this restore (Git checkout -b behavior)
        const restoreMessage = `Restored to version: ${targetVersion.commitMessage} (${versionId.substring(0, 8)})`;
        // The parent of this new state is the version we just restored FROM.
        // This creates a branch off that historical point.
        const newVersionId = await this.createSnapshot(restoreMessage, versionId);

        return newVersionId;
    }

    /**
     * Retrieves history of versions.
     * @returns {Promise<Array>}
     */
    async getVersions() {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_VERSIONS], 'readonly');
            const store = transaction.objectStore(STORE_VERSIONS);
            const request = store.getAll(); // Grab all for DAG construction

            request.onsuccess = () => {
                // Sort by timestamp descending by default
                const results = request.result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                resolve(results);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    // ==========================================
    // AI AUDIT LOGGING
    // ==========================================

    /**
     * Saves an immutable audit record of an AI operation.
     * @param {Object} record - { sourceUrl, prompt, extractedFields, responseSummary, versionId }
     * @returns {Promise<string>} - The ID of the audit record.
     */
    async saveAudit(record) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_AUDITS], 'readwrite');
            const store = transaction.objectStore(STORE_AUDITS);

            const auditEntry = {
                id: crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                ...record
            };

            const request = store.add(auditEntry);

            request.onsuccess = () => resolve(auditEntry.id);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    /**
     * Retrieves audit logs.
     * @returns {Promise<Array>}
     */
    async getAudits() {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_AUDITS], 'readonly');
            const store = transaction.objectStore(STORE_AUDITS);
            const request = store.getAll();

            request.onsuccess = () => {
                const results = request.result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                resolve(results);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }
}

export const storage = new StorageManager();
