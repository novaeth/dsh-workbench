import { productEnvOf, unitEnvOf, type ProductEnvInput, type UnitEnvInput } from '../env-policy.js';

export type SeamEnvInput = ProductEnvInput;

export type SeamUnitEnvInput = UnitEnvInput;

/**
 * 产品域（运行时根）的受控 env：隔离 HOME、npm/pnpm 缓存钉在运行时根、真 npmrc/gitconfig 只读指过去。
 * @param input 运行时根、可选的 HOME 与真实用户目录。
 * @returns 产品域 env。
 */
export function seamProductEnv(input: SeamEnvInput): Record<string, string> {
  return productEnvOf(input);
}

/**
 * 模块单元的受控 env：HOME 与 npm/pnpm 目录钉到单元数据目录。
 * @param input 运行时根、单元数据目录、可选的 TRUE 用户目录。
 * @returns 单元 env。
 */
export function seamUnitEnv(input: SeamUnitEnvInput): Record<string, string> {
  return unitEnvOf(input);
}
