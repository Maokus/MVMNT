import type { Result } from './api.js';

export interface AssetHandle {
  readonly url: string;
  dispose(): void;
}

export interface AssetApi {
  load(path: string): Promise<Result<AssetHandle>>;
}
