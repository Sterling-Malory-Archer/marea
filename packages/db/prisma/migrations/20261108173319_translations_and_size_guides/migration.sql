-- AlterTable
ALTER TABLE `size_scales` ADD COLUMN `guide` JSON NULL;

-- CreateTable
CREATE TABLE `product_translations` (
    `productId` INTEGER NOT NULL,
    `locale` VARCHAR(10) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `subtitle` VARCHAR(200) NULL,
    `description` TEXT NULL,
    `composition` TEXT NULL,
    `care` TEXT NULL,
    `seoTitle` VARCHAR(160) NULL,
    `seoDescription` VARCHAR(320) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `product_translations_locale_idx`(`locale`),
    FULLTEXT INDEX `product_translations_title_description_idx`(`title`, `description`),
    PRIMARY KEY (`productId`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `category_translations` (
    `categoryId` INTEGER NOT NULL,
    `locale` VARCHAR(10) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `seoTitle` VARCHAR(160) NULL,
    `seoDescription` VARCHAR(320) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`categoryId`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `collection_translations` (
    `collectionId` INTEGER NOT NULL,
    `locale` VARCHAR(10) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `eyebrow` VARCHAR(80) NULL,
    `description` TEXT NULL,
    `seoTitle` VARCHAR(160) NULL,
    `seoDescription` VARCHAR(320) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`collectionId`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `color_translations` (
    `colorId` INTEGER NOT NULL,
    `locale` VARCHAR(10) NOT NULL,
    `name` VARCHAR(60) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`colorId`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hero_slide_translations` (
    `heroSlideId` INTEGER NOT NULL,
    `locale` VARCHAR(10) NOT NULL,
    `eyebrow` VARCHAR(80) NULL,
    `headline` VARCHAR(120) NOT NULL,
    `body` VARCHAR(400) NULL,
    `primaryCtaLabel` VARCHAR(40) NULL,
    `secondaryCtaLabel` VARCHAR(40) NULL,
    `imageAlt` VARCHAR(255) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`heroSlideId`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcement_translations` (
    `announcementId` INTEGER NOT NULL,
    `locale` VARCHAR(10) NOT NULL,
    `message` VARCHAR(200) NOT NULL,
    `linkLabel` VARCHAR(60) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`announcementId`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_block_translations` (
    `contentBlockId` INTEGER NOT NULL,
    `locale` VARCHAR(10) NOT NULL,
    `eyebrow` VARCHAR(80) NULL,
    `title` VARCHAR(160) NOT NULL,
    `body` TEXT NULL,
    `ctaLabel` VARCHAR(40) NULL,
    `imageAlt` VARCHAR(255) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`contentBlockId`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_translations` ADD CONSTRAINT `product_translations_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `category_translations` ADD CONSTRAINT `category_translations_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `collection_translations` ADD CONSTRAINT `collection_translations_collectionId_fkey` FOREIGN KEY (`collectionId`) REFERENCES `collections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `color_translations` ADD CONSTRAINT `color_translations_colorId_fkey` FOREIGN KEY (`colorId`) REFERENCES `colors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hero_slide_translations` ADD CONSTRAINT `hero_slide_translations_heroSlideId_fkey` FOREIGN KEY (`heroSlideId`) REFERENCES `hero_slides`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcement_translations` ADD CONSTRAINT `announcement_translations_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `announcement_messages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `content_block_translations` ADD CONSTRAINT `content_block_translations_contentBlockId_fkey` FOREIGN KEY (`contentBlockId`) REFERENCES `content_blocks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
