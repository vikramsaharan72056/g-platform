import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe, Logger } from '@nestjs/common';

async function bootstrap() {
    const logger = new Logger('Bootstrap');
    const app = await NestFactory.create(AppModule);

    app.enableCors();
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        transform: true,
    }));

    const port = process.env.PORT || 3401;
    await app.listen(port);

    logger.log(`Dragon Tiger API is running on: http://localhost:${port}`);

    // Self-registration with Hub
    try {
        const { HubClient } = await import('./core/hub-client.js');
        const hubClient = app.get(HubClient);
        await hubClient.registerSelf();
    } catch (e) {
        logger.error('Failed to trigger self-registration', e);
    }
}

bootstrap();
