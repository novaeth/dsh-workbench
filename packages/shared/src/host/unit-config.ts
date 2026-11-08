/**
 * 单元配置的落盘接口：`deps.store.for(unit, workspace)` 交出来的那个形状。
 */
export interface UnitConfigStore {
  read(name: string): unknown | null;
  write(name: string, value: unknown): void;
  remove(name: string): void;
}

/**
 * `createUnitConfig` 的入参。
 */
export interface UnitConfigOptions<T> {
  readonly store: UnitConfigStore;
  readonly file: string;
  readonly fallback: T;
  readonly normalize: (raw: unknown) => T;
}

/**
 * 一份单元配置的读写器：读坏了退回兜底，写入前先规范化。
 */
export interface UnitConfig<T> {
  read(): T;
  write(payload: unknown): T;
  reset(): void;
}

/**
 * 把「一个 JSON 文件 + 一份兜底 + 一个规范化函数」接成模块配置的读写器。
 * @param options.store - 落盘位置：模块自己的 `deps.store.for(unit, workspace)`。
 * @param options.file - 文件名（如 `config.json`）。
 * @param options.fallback - 没存过或存坏了时返回的那份。
 * @param options.normalize - 把任意输入收成 `T`；写口不合法时直接抛。
 * @returns 读 / 写 / 清空三件事。
 */
export function createUnitConfig<T>({
  store,
  file,
  fallback,
  normalize,
}: UnitConfigOptions<T>): UnitConfig<T> {
  return {
    read() {
      try {
        return normalize(store.read(file));
      } catch {
        return fallback;
      }
    },
    write(payload) {
      const value = normalize(payload);
      store.write(file, value);
      return value;
    },
    reset() {
      store.remove(file);
    },
  };
}
