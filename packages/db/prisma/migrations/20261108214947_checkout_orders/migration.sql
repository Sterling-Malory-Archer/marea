-- AlterTable
ALTER TABLE `orders` ADD COLUMN `accessTokenHash` CHAR(64) NULL,
    ADD COLUMN `cartId` INTEGER NULL,
    ADD COLUMN `locale` VARCHAR(10) NOT NULL DEFAULT 'en',
    ADD COLUMN `shippingCountry` CHAR(2) NOT NULL DEFAULT 'ME';
