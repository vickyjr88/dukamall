import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/** What the shop pays for its goods. The owner's business, never the shopper's. */
const PRIVATE_KEYS = new Set(['costKes', 'unitCostKes']);

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;

/** A copy of a response with every cost field removed, however deeply it is nested (an order's lines' variants' products). */
export function withoutPrivateCosts<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withoutPrivateCosts(item)) as unknown as T;
  if (!isPlain(value)) return value; // a date or a Prisma Decimal is left exactly as it is
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!PRIVATE_KEYS.has(key)) out[key] = withoutPrivateCosts(item);
  }
  return out as T;
}

/**
 * Costs are stored with products and order lines, and several public routes return those rows whole (the product list,
 * a shopper's own orders, their favourites). Rather than trusting each of them to leave the field out, every response
 * outside the merchant portal and the platform admin has the cost fields removed on the way out.
 */
@Injectable()
export class PrivateCostsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ path?: string; url?: string }>();
    const path = req?.path ?? req?.url ?? '';
    if (/^\/(portal|admin)(\/|$)/.test(path)) return next.handle();
    return next.handle().pipe(map((body) => withoutPrivateCosts(body)));
  }
}
