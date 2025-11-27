/**
 * Storage Module
 * Handles all interactions with IndexedDB for storing collections and items.
 */

const DB_NAME = 'SmartWebCollectorDB';
const DB_VERSION = 1;
const STORE_COLLECTIONS = 'collections';

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
                if (!db.objectStoreNames.contains(STORE_COLLECTIONS)) {
                    const store = db.createObjectStore(STORE_COLLECTIONS, { keyPath: 'id' });
                    store.createIndex('created', 'created', { unique: false });
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
}

export const storage = new StorageManager();
