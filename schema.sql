-- Una fila = una fila de la planilla. Cada movimiento de un serial es una fila nueva.
-- La fila "limpia" (solo serial + ID Telpo) significa que el validador está disponible.
CREATE TABLE IF NOT EXISTS movimientos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  serial VARCHAR(40) NOT NULL,
  telpo_id VARCHAR(40) NOT NULL DEFAULT '',
  donde VARCHAR(80) NOT NULL DEFAULT '',
  asignado VARCHAR(80) NOT NULL DEFAULT '',
  coche VARCHAR(40) NOT NULL DEFAULT '',
  empresa VARCHAR(80) NOT NULL DEFAULT '',
  fecha_instalacion DATE NULL,
  fecha_retiro DATE NULL,
  creado TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_serial (serial),
  INDEX idx_empresa (empresa)
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario VARCHAR(60) NOT NULL UNIQUE,
  clave_hash VARCHAR(200) NOT NULL,
  creado TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS sesiones (
  token CHAR(64) PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  expira DATETIME NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) CHARACTER SET utf8mb4;

-- Cada vez que cambia el ID Telpo de un serial queda registrado aquí.
CREATE TABLE IF NOT EXISTS cambios_id (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  serial VARCHAR(40) NOT NULL,
  id_anterior VARCHAR(40) NOT NULL,
  id_nuevo VARCHAR(40) NOT NULL,
  usuario VARCHAR(60) NOT NULL DEFAULT '',
  fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_serial (serial)
) CHARACTER SET utf8mb4;

-- Lista de técnicos que se pueden elegir al asignar o retirar un validador.
CREATE TABLE IF NOT EXISTS tecnicos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL UNIQUE,
  activo TINYINT(1) NOT NULL DEFAULT 1
) CHARACTER SET utf8mb4;
