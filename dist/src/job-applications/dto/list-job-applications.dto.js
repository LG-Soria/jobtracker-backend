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
exports.ListJobApplicationsQueryDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const create_job_application_dto_1 = require("./create-job-application.dto");
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
class ListJobApplicationsQueryDto {
    constructor() {
        this.page = DEFAULT_PAGE;
        this.limit = DEFAULT_LIMIT;
    }
}
exports.ListJobApplicationsQueryDto = ListJobApplicationsQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(create_job_application_dto_1.JobStatus),
    (0, class_transformer_1.Transform)(({ value }) => (0, create_job_application_dto_1.normalizeJobStatusInput)(value)),
    __metadata("design:type", String)
], ListJobApplicationsQueryDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], ListJobApplicationsQueryDto.prototype, "fromDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], ListJobApplicationsQueryDto.prototype, "toDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ListJobApplicationsQueryDto.prototype, "q", void 0);
__decorate([
    (0, class_transformer_1.Transform)(({ value }) => {
        const num = Number(value);
        if (!value || Number.isNaN(num))
            return DEFAULT_PAGE;
        return Math.trunc(num);
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ListJobApplicationsQueryDto.prototype, "page", void 0);
__decorate([
    (0, class_transformer_1.Transform)(({ value }) => {
        const num = Number(value);
        if (!value || Number.isNaN(num))
            return DEFAULT_LIMIT;
        return Math.min(Math.trunc(num), MAX_LIMIT);
    }),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(MAX_LIMIT),
    __metadata("design:type", Number)
], ListJobApplicationsQueryDto.prototype, "limit", void 0);
//# sourceMappingURL=list-job-applications.dto.js.map