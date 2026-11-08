-- Extra databases for local development (the main `marea` DB is created by the image).
CREATE DATABASE IF NOT EXISTS marea_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS marea_shadow CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON marea_test.* TO 'marea'@'%';
GRANT ALL PRIVILEGES ON marea_shadow.* TO 'marea'@'%';
FLUSH PRIVILEGES;
