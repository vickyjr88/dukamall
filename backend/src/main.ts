import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // The API sits behind nginx, which appends the real client address to
  // X-Forwarded-For. Without this Express reports the proxy's own address as
  // every request's IP, so per-IP rate limits (see common/rate-limit.decorator)
  // would put all users in one bucket and lock everyone out together. One
  // hop: only the last proxy is trusted, so a client can't spoof its way
  // out of a limit by sending its own X-Forwarded-For.
  app.set('trust proxy', 1);
  // Paystack's webhook signature (PaystackService.verifySignature) is an
  // HMAC over the exact raw request bytes -- by the time a controller sees
  // `@Body()`, Nest/Express have already parsed and re-serialized it, which
  // rarely reproduces byte-for-byte and would make every signature check
  // fail. json()'s own `verify` hook runs before that parsing and is the
  // one place the raw buffer is still available; stashing it on the request
  // costs nothing for every other route, which never reads it.
  app.use(json({ limit: '10mb', verify: (req: any, _res, buf) => { req.rawBody = buf; } }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  app.enableCors({
    origin: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    // x-shop-id carries the resolved tenant from the storefront's own domain
    // middleware (see web/middleware.ts) -- every request that isn't scoped
    // by a staff/customer JWT's own shopId claim needs to pass it explicitly.
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-shop-id'],
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  const config = new DocumentBuilder()
    .setTitle('Shops Platform API')
    .setDescription('API documentation for the Dubai Merchants Shops Platform')
    .setVersion('0.1')
    .addTag('api')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(Number(process.env.PORT) || 3200, '0.0.0.0');
  console.log('Shops Platform backend listening on http://0.0.0.0:3200');
}
bootstrap();
