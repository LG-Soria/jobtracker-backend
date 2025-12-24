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
exports.CreateJobApplicationDto = exports.normalizeJobStatusInput = exports.JOB_STATUS_LABELS = exports.JobStatus = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
var JobStatus;
(function (JobStatus) {
    JobStatus["ENVIADA"] = "ENVIADA";
    JobStatus["EN_PROCESO"] = "EN_PROCESO";
    JobStatus["ENTREVISTA"] = "ENTREVISTA";
    JobStatus["RECHAZADA"] = "RECHAZADA";
    JobStatus["SIN_RESPUESTA"] = "SIN_RESPUESTA";
})(JobStatus || (exports.JobStatus = JobStatus = {}));
const STATUS_LOOKUP = {
    ENVIADA: JobStatus.ENVIADA,
    EN_PROCESO: JobStatus.EN_PROCESO,
    ENTREVISTA: JobStatus.ENTREVISTA,
    RECHAZADA: JobStatus.RECHAZADA,
    SIN_RESPUESTA: JobStatus.SIN_RESPUESTA,
};
exports.JOB_STATUS_LABELS = {
    [JobStatus.ENVIADA]: 'Enviada',
    [JobStatus.EN_PROCESO]: 'En proceso',
    [JobStatus.ENTREVISTA]: 'Entrevista',
    [JobStatus.RECHAZADA]: 'Rechazada',
    [JobStatus.SIN_RESPUESTA]: 'Sin respuesta',
};
const normalizeJobStatusInput = (value) => {
    if (value === undefined || value === null)
        return undefined;
    const normalized = value
        .toString()
        .trim()
        .replace(/[\s-]+/g, '_')
        .toUpperCase();
    return STATUS_LOOKUP[normalized];
};
exports.normalizeJobStatusInput = normalizeJobStatusInput;
class CreateJobApplicationDto {
}
exports.CreateJobApplicationDto = CreateJobApplicationDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateJobApplicationDto.prototype, "company", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateJobApplicationDto.prototype, "position", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateJobApplicationDto.prototype, "source", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateJobApplicationDto.prototype, "applicationDate", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(JobStatus),
    (0, class_transformer_1.Transform)(({ value }) => (0, exports.normalizeJobStatusInput)(value)),
    __metadata("design:type", String)
], CreateJobApplicationDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateJobApplicationDto.prototype, "notes", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUrl)(),
    __metadata("design:type", String)
], CreateJobApplicationDto.prototype, "jobUrl", void 0);
//# sourceMappingURL=create-job-application.dto.js.map