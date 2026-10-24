export const PROFILE_CREATE_ROUTE = 'profile-create';

export const PROFILE_CREATE_RESOURCE = 'profileCreate';

export interface ProfileCreateProfile {
  readonly name: string;
  readonly current: boolean;
  readonly readable: boolean;
}

export interface ProfileCreateSnapshot {
  readonly current: string;
  readonly profiles: readonly ProfileCreateProfile[];
}

export interface ProfileCreateCopy {
  readonly settings: boolean;
  readonly plugins: boolean;
  readonly projects: boolean;
  readonly sessions: boolean;
}

export interface ProfileCreateRequest {
  readonly profile: string;
  readonly source: string;
  readonly copy: ProfileCreateCopy;
}

export interface ProfileCreateApplied {
  readonly ok: true;
  readonly profile: string;
  readonly source: string;
  readonly home: string;
  readonly command: string;
  readonly copied: readonly string[];
}
