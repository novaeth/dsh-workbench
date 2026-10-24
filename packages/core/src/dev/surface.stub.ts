import { createNoopDevSurface, installDevSurface } from '@/shared/dev-surface';

installDevSurface(createNoopDevSurface());

export {};
