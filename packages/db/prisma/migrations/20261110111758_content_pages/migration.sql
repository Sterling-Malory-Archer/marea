-- CreateTable
CREATE TABLE `pages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(120) NOT NULL,
    `kind` ENUM('STANDARD', 'CONTACT', 'SHIPPING', 'SIZE_GUIDE', 'LEGAL') NOT NULL DEFAULT 'STANDARD',
    `title` VARCHAR(160) NOT NULL,
    `intro` VARCHAR(500) NULL,
    `body` TEXT NULL,
    `seoTitle` VARCHAR(160) NULL,
    `seoDescription` VARCHAR(320) NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT true,
    `needsReview` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pages_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `page_translations` (
    `pageId` INTEGER NOT NULL,
    `locale` VARCHAR(10) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `intro` VARCHAR(500) NULL,
    `body` TEXT NULL,
    `seoTitle` VARCHAR(160) NULL,
    `seoDescription` VARCHAR(320) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`pageId`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `page_translations` ADD CONSTRAINT `page_translations_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `pages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
