/**
 * AuthManager handles Google OAuth flow using chrome.identity API
 */
class AuthManager {
    constructor() {
        this.user = null;
        this.token = null;
        this.onAuthStateChanged = null;
    }

    /**
     * Initialize auth state
     */
    async init() {
        try {
            // Check if we have a cached token
            const token = await this.getAuthToken(false);
            if (token) {
                this.token = token;
                await this.fetchUserProfile();
            }
        } catch (e) {
            console.log('Auth init: User not signed in', e);
        }
    }

    /**
     * Get auth token from chrome.identity
     * @param {boolean} interactive - Whether to prompt user if not signed in
     */
    getAuthToken(interactive = false) {
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive }, (token) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(token);
                }
            });
        });
    }

    /**
     * Sign in user
     */
    async login() {
        try {
            this.token = await this.getAuthToken(true);
            await this.fetchUserProfile();
            return this.user;
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    }

    /**
     * Sign out user
     */
    async logout() {
        if (!this.token) return;

        try {
            // Remove cached token
            await new Promise((resolve) => {
                chrome.identity.removeCachedAuthToken({ token: this.token }, resolve);
            });

            // Revoke token (optional but good practice)
            try {
                await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${this.token}`);
            } catch (e) {
                console.warn('Token revocation failed', e);
            }

            this.token = null;
            this.user = null;

            if (this.onAuthStateChanged) {
                this.onAuthStateChanged(null);
            }
        } catch (error) {
            console.error('Logout failed:', error);
        }
    }

    /**
     * Fetch user profile from Google People API
     */
    async fetchUserProfile() {
        if (!this.token) return;

        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch user profile');
            }

            const data = await response.json();
            this.user = {
                id: data.id,
                email: data.email,
                name: data.name,
                picture: data.picture
            };

            if (this.onAuthStateChanged) {
                this.onAuthStateChanged(this.user);
            }
        } catch (error) {
            console.error('Fetch profile failed:', error);
            // If fetch fails (e.g. invalid token), clear state
            this.token = null;
            this.user = null;
            if (this.onAuthStateChanged) {
                this.onAuthStateChanged(null);
            }
        }
    }

    /**
     * Subscribe to auth state changes
     */
    subscribe(callback) {
        this.onAuthStateChanged = callback;
        // Immediate callback with current state
        callback(this.user);
    }
}

// Export singleton
const authManager = new AuthManager();
window.AuthManager = authManager;
