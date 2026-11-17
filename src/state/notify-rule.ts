// Quando avisar pelo Windows: só ao ENTRAR em "esperando você" e fora de vista.
import type { Status } from './types';

export function shouldNotify(prev: Status, next: Status, windowFocused: boolean, visible: boolean): boolean {
  return next === 'wait' && prev !== 'wait' && (!windowFocused || !visible);
}
