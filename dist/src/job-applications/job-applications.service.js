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
exports.JobApplicationsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const create_job_application_dto_1 = require("./dto/create-job-application.dto");
let JobApplicationsService = class JobApplicationsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.mapToApiStatus = (item) => (Object.assign(Object.assign({}, item), { status: this.fromPrismaStatus(item.status) }));
    }
    async create(userId, payload) {
        const applicationDate = this.toDate(payload.applicationDate);
        const created = await this.prisma.$transaction(async (tx) => {
            const jobApplication = await tx.jobApplication.create({
                data: {
                    company: payload.company,
                    position: payload.position,
                    source: payload.source,
                    notes: payload.notes,
                    jobUrl: payload.jobUrl,
                    applicationDate,
                    status: this.toPrismaStatus(payload.status),
                    userId,
                },
            });
            await tx.jobApplicationHistory.create({
                data: {
                    jobApplicationId: jobApplication.id,
                    type: client_1.JobApplicationHistoryType.CREATED,
                    meta: {},
                    actorUserId: userId,
                },
            });
            return jobApplication;
        });
        return this.mapToApiStatus(created);
    }
    async findAll(userId, filters) {
        var _a, _b, _c;
        const where = {
            userId,
        };
        if (filters === null || filters === void 0 ? void 0 : filters.status) {
            where.status = this.toPrismaStatus(filters.status);
        }
        if ((filters === null || filters === void 0 ? void 0 : filters.fromDate) || (filters === null || filters === void 0 ? void 0 : filters.toDate)) {
            where.applicationDate = {};
            if (filters.fromDate) {
                where.applicationDate.gte = this.toDate(filters.fromDate);
            }
            if (filters.toDate) {
                where.applicationDate.lte = this.toDate(filters.toDate);
            }
        }
        const search = (_a = filters === null || filters === void 0 ? void 0 : filters.q) === null || _a === void 0 ? void 0 : _a.trim();
        if (search) {
            where.OR = [
                { company: { contains: search, mode: 'insensitive' } },
                { position: { contains: search, mode: 'insensitive' } },
            ];
        }
        const page = (_b = filters === null || filters === void 0 ? void 0 : filters.page) !== null && _b !== void 0 ? _b : 1;
        const limit = (_c = filters === null || filters === void 0 ? void 0 : filters.limit) !== null && _c !== void 0 ? _c : 20;
        const skip = (page - 1) * limit;
        const [items, total] = await this.prisma.$transaction([
            this.prisma.jobApplication.findMany({
                where,
                orderBy: [
                    { createdAt: 'desc' },
                    { applicationDate: 'desc' },
                ],
                skip,
                take: limit,
            }),
            this.prisma.jobApplication.count({ where }),
        ]);
        const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
        return {
            items: items.map(this.mapToApiStatus),
            meta: {
                page,
                limit,
                total,
                totalPages,
            },
        };
    }
    async findOne(userId, id) {
        const application = await this.assertOwnership(id, userId);
        return this.mapToApiStatus(application);
    }
    async update(userId, id, data) {
        const existing = await this.assertOwnership(id, userId);
        const updateData = {};
        if (data.company !== undefined)
            updateData.company = data.company;
        if (data.position !== undefined)
            updateData.position = data.position;
        if (data.source !== undefined)
            updateData.source = data.source;
        if (data.notes !== undefined)
            updateData.notes = data.notes;
        if (data.jobUrl !== undefined)
            updateData.jobUrl = data.jobUrl;
        if (data.status !== undefined) {
            updateData.status = this.toPrismaStatus(data.status);
        }
        if (data.applicationDate !== undefined) {
            updateData.applicationDate = this.toDate(data.applicationDate);
        }
        const newStatus = updateData.status;
        const statusChanged = newStatus !== undefined && newStatus !== existing.status;
        const updated = await this.prisma.$transaction(async (tx) => {
            const updatedApplication = await tx.jobApplication.update({
                where: { id },
                data: updateData,
            });
            if (statusChanged) {
                await tx.jobApplicationHistory.create({
                    data: {
                        jobApplicationId: id,
                        type: client_1.JobApplicationHistoryType.STATUS_CHANGED,
                        meta: {
                            from: existing.status,
                            to: updatedApplication.status,
                        },
                        actorUserId: userId,
                    },
                });
            }
            return updatedApplication;
        });
        return this.mapToApiStatus(updated);
    }
    async remove(userId, id) {
        await this.assertOwnership(id, userId);
        const removed = await this.prisma.jobApplication.delete({
            where: { id },
        });
        return this.mapToApiStatus(removed);
    }
    async getHistory(userId, id) {
        await this.assertOwnership(id, userId);
        const items = await this.prisma.jobApplicationHistory.findMany({
            where: { jobApplicationId: id },
            orderBy: { createdAt: 'asc' },
        });
        return items.map((entry) => this.mapHistory(entry));
    }
    async assertOwnership(id, userId) {
        const owned = await this.prisma.jobApplication.findFirst({
            where: { id, userId },
        });
        if (!owned) {
            throw new common_1.NotFoundException('Job application not found');
        }
        return owned;
    }
    toPrismaStatus(status) {
        const normalized = (0, create_job_application_dto_1.normalizeJobStatusInput)(status);
        if (!normalized)
            throw new common_1.BadRequestException(`Estado invalido: "${status}"`);
        return normalized;
    }
    fromPrismaStatus(status) {
        const mapped = (0, create_job_application_dto_1.normalizeJobStatusInput)(status);
        if (!mapped)
            throw new common_1.BadRequestException('Estado invalido');
        return mapped;
    }
    mapHistory(entry) {
        var _a;
        if (entry.type === client_1.JobApplicationHistoryType.STATUS_CHANGED) {
            const meta = entry.meta;
            return Object.assign(Object.assign({}, entry), { meta: {
                    from: (meta === null || meta === void 0 ? void 0 : meta.from) ? this.fromPrismaStatus(meta.from) : undefined,
                    to: (meta === null || meta === void 0 ? void 0 : meta.to) ? this.fromPrismaStatus(meta.to) : undefined,
                } });
        }
        return Object.assign(Object.assign({}, entry), { meta: (_a = entry.meta) !== null && _a !== void 0 ? _a : {} });
    }
    toDate(dateString) {
        if (!dateString) {
            throw new common_1.BadRequestException('applicationDate invalida');
        }
        const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString);
        if (match) {
            const [, y, m, d] = match;
            const dateUtc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
            return dateUtc;
        }
        const parsed = new Date(dateString);
        if (Number.isNaN(parsed.getTime())) {
            throw new common_1.BadRequestException('applicationDate invalida');
        }
        return parsed;
    }
};
exports.JobApplicationsService = JobApplicationsService;
exports.JobApplicationsService = JobApplicationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], JobApplicationsService);
//# sourceMappingURL=job-applications.service.js.map