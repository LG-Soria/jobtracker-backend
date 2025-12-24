"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const argon2 = require("argon2");
const prisma_service_1 = require("../prisma/prisma.service");
const auth_constants_1 = require("./auth.constants");
let AuthService = class AuthService {
    constructor(prisma, jwtService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
    }
    async login(dto) {
        const user = await this.validateCredentials(dto.email, dto.password);
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
        };
        const token = await this.jwtService.signAsync(payload);
        return { token, payload };
    }
    setAuthCookie(res, token) {
        res.cookie(auth_constants_1.JWT_COOKIE_NAME, token, (0, auth_constants_1.buildCookieOptions)());
    }
    clearAuthCookie(res) {
        res.clearCookie(auth_constants_1.JWT_COOKIE_NAME, Object.assign(Object.assign({}, (0, auth_constants_1.buildCookieOptions)()), { maxAge: 0 }));
    }
    async verifyTokenFromCookie(token) {
        if (!token) {
            throw new common_1.UnauthorizedException('Auth token missing');
        }
        try {
            return await this.jwtService.verifyAsync(token, {
                secret: (0, auth_constants_1.getJwtSecret)(),
            });
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Invalid or expired token');
        }
    }
    async validateCredentials(email, password) {
        const normalizedEmail = email.trim().toLowerCase();
        const user = await this.prisma.user.findUnique({
            where: { email: normalizedEmail },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const isValid = await argon2.verify(user.passwordHash, password);
        if (!isValid) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        return user;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map