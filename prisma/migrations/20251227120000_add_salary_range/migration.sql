-- Add salary range fields and supporting enums to JobApplication.

-- CreateEnum
CREATE TYPE "SalaryCurrency" AS ENUM ('ARS', 'USD', 'EUR');

-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('Mensual', 'Anual', 'Hora');

-- CreateEnum
CREATE TYPE "SalaryType" AS ENUM ('Bruto', 'Neto');

-- AlterTable
ALTER TABLE "JobApplication"
  ADD COLUMN "salaryMin" INTEGER,
  ADD COLUMN "salaryMax" INTEGER,
  ADD COLUMN "salaryCurrency" "SalaryCurrency",
  ADD COLUMN "salaryPeriod" "SalaryPeriod",
  ADD COLUMN "salaryType" "SalaryType";
