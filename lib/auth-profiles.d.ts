export interface AuthProfileConfig {
    storageStatePath: string;
    allowedDomains: string[];
    /** Persist cookies/localStorage back after a transient context closes. Defaults to false. */
    persistState?: boolean;
}
export interface ResolvedAuthProfile extends AuthProfileConfig {
    id: string;
    persistState: boolean;
}
export declare function hostAllowed(hostname: string, domains: readonly string[]): boolean;
export declare class AuthProfileStore {
    private readonly profiles;
    constructor(profiles?: Record<string, AuthProfileConfig>);
    resolve(id: string, targetUrl: string): ResolvedAuthProfile;
    list(): {
        id: string;
        allowedDomains: string[];
        persistState: boolean;
    }[];
    /** Look up a single profile with its storageStatePath (undefined if unknown). */
    get(id: string): ResolvedAuthProfile | undefined;
}
/**
 * Dynamically load auth profiles from a directory. Each `*.json` file is one
 * profile; the file name (without extension) is the profile id. The directory
 * is created on demand so the feature works out of the box with an empty store.
 * A file whose shape is not a valid {@link AuthProfileConfig} is skipped and
 * reported via `errors` so one bad file cannot break the whole store.
 */
export declare function resolveAuthProfilesFromDirectory(dir: string): {
    profiles: Record<string, AuthProfileConfig>;
    errors: {
        id: string;
        reason: string;
    }[];
};
