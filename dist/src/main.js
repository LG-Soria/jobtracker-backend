"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const cookieParser = require("cookie-parser");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.use(cookieParser());
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
        forbidUnknownValues: false,
    }));
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    app.enableCors({
        origin: 'http://localhost:3001',
        credentials: true,
    });
    const port = process.env.PORT || 3000;
    await app.listen(port);
}
bootstrap();
//# sourceMappingURL=main.js.map