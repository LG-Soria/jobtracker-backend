"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobApplicationsModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("../auth/auth.module");
const prisma_module_1 = require("../prisma/prisma.module");
const job_applications_controller_1 = require("./job-applications.controller");
const job_applications_service_1 = require("./job-applications.service");
let JobApplicationsModule = class JobApplicationsModule {
};
exports.JobApplicationsModule = JobApplicationsModule;
exports.JobApplicationsModule = JobApplicationsModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, auth_module_1.AuthModule],
        controllers: [job_applications_controller_1.JobApplicationsController],
        providers: [job_applications_service_1.JobApplicationsService],
        exports: [job_applications_service_1.JobApplicationsService],
    })
], JobApplicationsModule);
//# sourceMappingURL=job-applications.module.js.map