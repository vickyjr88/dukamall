import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(json({ limit: '10mb' }));
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
