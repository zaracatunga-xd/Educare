-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: educare_db
-- ------------------------------------------------------
-- Server version	8.0.45

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `apoderado`
--

DROP TABLE IF EXISTS `apoderado`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `apoderado` (
  `id_apoderado` int NOT NULL AUTO_INCREMENT,
  `id_persona` int NOT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id_apoderado`),
  UNIQUE KEY `id_persona` (`id_persona`),
  CONSTRAINT `apoderado_ibfk_1` FOREIGN KEY (`id_persona`) REFERENCES `persona` (`id_persona`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `apoderado`
--

LOCK TABLES `apoderado` WRITE;
/*!40000 ALTER TABLE `apoderado` DISABLE KEYS */;
/*!40000 ALTER TABLE `apoderado` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `apoderado_estudiante`
--

DROP TABLE IF EXISTS `apoderado_estudiante`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `apoderado_estudiante` (
  `id_apoderado` int NOT NULL,
  `id_estudiante` int NOT NULL,
  `parentesco` varchar(50) DEFAULT NULL,
  `estado` char(1) NOT NULL DEFAULT 'A',
  PRIMARY KEY (`id_apoderado`,`id_estudiante`),
  KEY `id_estudiante` (`id_estudiante`),
  CONSTRAINT `apoderado_estudiante_ibfk_1` FOREIGN KEY (`id_apoderado`) REFERENCES `apoderado` (`id_apoderado`),
  CONSTRAINT `apoderado_estudiante_ibfk_2` FOREIGN KEY (`id_estudiante`) REFERENCES `estudiante` (`id_estudiante`),
  CONSTRAINT `apoderado_estudiante_chk_1` CHECK ((`estado` in (_utf8mb4'A',_utf8mb4'I')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `apoderado_estudiante`
--

LOCK TABLES `apoderado_estudiante` WRITE;
/*!40000 ALTER TABLE `apoderado_estudiante` DISABLE KEYS */;
/*!40000 ALTER TABLE `apoderado_estudiante` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `asignatura`
--

DROP TABLE IF EXISTS `asignatura`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asignatura` (
  `id_asignatura` int NOT NULL AUTO_INCREMENT,
  `codigo` varchar(20) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `estado` char(1) NOT NULL DEFAULT 'A',
  PRIMARY KEY (`id_asignatura`),
  UNIQUE KEY `codigo` (`codigo`),
  CONSTRAINT `asignatura_chk_1` CHECK ((`estado` in (_utf8mb4'A',_utf8mb4'I')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asignatura`
--

LOCK TABLES `asignatura` WRITE;
/*!40000 ALTER TABLE `asignatura` DISABLE KEYS */;
/*!40000 ALTER TABLE `asignatura` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `asistencia`
--

DROP TABLE IF EXISTS `asistencia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `asistencia` (
  `id_asistencia` int NOT NULL AUTO_INCREMENT,
  `id_sesion` int NOT NULL,
  `id_estudiante` int NOT NULL,
  `id_inscripcion` int NOT NULL,
  `id_curso_periodo` int NOT NULL,
  `estado` varchar(20) NOT NULL,
  `observacion` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id_asistencia`),
  UNIQUE KEY `id_sesion` (`id_sesion`,`id_estudiante`),
  KEY `id_sesion_2` (`id_sesion`,`id_curso_periodo`),
  KEY `id_inscripcion` (`id_inscripcion`,`id_estudiante`,`id_curso_periodo`),
  CONSTRAINT `asistencia_ibfk_1` FOREIGN KEY (`id_sesion`, `id_curso_periodo`) REFERENCES `sesion_clase` (`id_sesion`, `id_curso_periodo`),
  CONSTRAINT `asistencia_ibfk_2` FOREIGN KEY (`id_inscripcion`, `id_estudiante`, `id_curso_periodo`) REFERENCES `inscripcion` (`id_inscripcion`, `id_estudiante`, `id_curso_periodo`),
  CONSTRAINT `asistencia_chk_1` CHECK ((`estado` in (_utf8mb4'Presente',_utf8mb4'Ausente',_utf8mb4'Tardanza')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `asistencia`
--

LOCK TABLES `asistencia` WRITE;
/*!40000 ALTER TABLE `asistencia` DISABLE KEYS */;
/*!40000 ALTER TABLE `asistencia` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auditoria`
--

DROP TABLE IF EXISTS `auditoria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditoria` (
  `id_auditoria` int NOT NULL AUTO_INCREMENT,
  `id_usuario` int DEFAULT NULL,
  `accion` varchar(50) NOT NULL,
  `tabla_afectada` varchar(50) DEFAULT NULL,
  `id_registro` int DEFAULT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `fecha` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_auditoria`),
  KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `auditoria_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id_usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auditoria`
--

LOCK TABLES `auditoria` WRITE;
/*!40000 ALTER TABLE `auditoria` DISABLE KEYS */;
/*!40000 ALTER TABLE `auditoria` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `aviso`
--

DROP TABLE IF EXISTS `aviso`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `aviso` (
  `id_aviso` int NOT NULL AUTO_INCREMENT,
  `id_usuario` int NOT NULL,
  `titulo` varchar(100) NOT NULL,
  `contenido` varchar(2000) NOT NULL,
  `prioridad` varchar(20) NOT NULL DEFAULT 'Normal',
  `fecha_publicacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_expiracion` date DEFAULT NULL,
  `estado` char(1) NOT NULL DEFAULT 'A',
  PRIMARY KEY (`id_aviso`),
  KEY `id_usuario` (`id_usuario`),
  CONSTRAINT `aviso_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id_usuario`),
  CONSTRAINT `aviso_chk_1` CHECK ((`prioridad` in (_utf8mb4'Baja',_utf8mb4'Normal',_utf8mb4'Alta'))),
  CONSTRAINT `aviso_chk_2` CHECK ((`estado` in (_utf8mb4'A',_utf8mb4'I')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `aviso`
--

LOCK TABLES `aviso` WRITE;
/*!40000 ALTER TABLE `aviso` DISABLE KEYS */;
/*!40000 ALTER TABLE `aviso` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `aviso_destinatario`
--

DROP TABLE IF EXISTS `aviso_destinatario`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `aviso_destinatario` (
  `id_aviso_destinatario` int NOT NULL AUTO_INCREMENT,
  `id_aviso` int NOT NULL,
  `tipo_destino` varchar(20) NOT NULL,
  `id_usuario` int DEFAULT NULL,
  `id_rol` int DEFAULT NULL,
  `id_curso` int DEFAULT NULL,
  `fecha_lectura` datetime DEFAULT NULL,
  PRIMARY KEY (`id_aviso_destinatario`),
  KEY `id_aviso` (`id_aviso`),
  KEY `id_usuario` (`id_usuario`),
  KEY `id_rol` (`id_rol`),
  KEY `id_curso` (`id_curso`),
  CONSTRAINT `aviso_destinatario_ibfk_1` FOREIGN KEY (`id_aviso`) REFERENCES `aviso` (`id_aviso`),
  CONSTRAINT `aviso_destinatario_ibfk_2` FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id_usuario`),
  CONSTRAINT `aviso_destinatario_ibfk_3` FOREIGN KEY (`id_rol`) REFERENCES `rol` (`id_rol`),
  CONSTRAINT `aviso_destinatario_ibfk_4` FOREIGN KEY (`id_curso`) REFERENCES `curso` (`id_curso`),
  CONSTRAINT `aviso_destinatario_chk_1` CHECK ((`tipo_destino` in (_utf8mb4'GLOBAL',_utf8mb4'ROL',_utf8mb4'CURSO',_utf8mb4'USUARIO'))),
  CONSTRAINT `aviso_destinatario_chk_2` CHECK ((((`tipo_destino` = _utf8mb4'GLOBAL') and (`id_usuario` is null) and (`id_rol` is null) and (`id_curso` is null)) or ((`tipo_destino` = _utf8mb4'ROL') and (`id_usuario` is null) and (`id_rol` is not null) and (`id_curso` is null)) or ((`tipo_destino` = _utf8mb4'CURSO') and (`id_usuario` is null) and (`id_rol` is null) and (`id_curso` is not null)) or ((`tipo_destino` = _utf8mb4'USUARIO') and (`id_usuario` is not null) and (`id_rol` is null) and (`id_curso` is null))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `aviso_destinatario`
--

LOCK TABLES `aviso_destinatario` WRITE;
/*!40000 ALTER TABLE `aviso_destinatario` DISABLE KEYS */;
/*!40000 ALTER TABLE `aviso_destinatario` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `calificacion`
--

DROP TABLE IF EXISTS `calificacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `calificacion` (
  `id_calificacion` int NOT NULL AUTO_INCREMENT,
  `id_evaluacion` int NOT NULL,
  `id_estudiante` int NOT NULL,
  `id_inscripcion` int NOT NULL,
  `id_curso_periodo` int NOT NULL,
  `puntaje_obtenido` decimal(5,2) DEFAULT NULL,
  `nota` decimal(3,2) DEFAULT NULL,
  `observacion` varchar(255) DEFAULT NULL,
  `fecha_registro` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_calificacion`),
  UNIQUE KEY `id_evaluacion` (`id_evaluacion`,`id_estudiante`),
  KEY `id_evaluacion_2` (`id_evaluacion`,`id_curso_periodo`),
  KEY `id_inscripcion` (`id_inscripcion`,`id_estudiante`,`id_curso_periodo`),
  CONSTRAINT `calificacion_ibfk_1` FOREIGN KEY (`id_evaluacion`, `id_curso_periodo`) REFERENCES `evaluacion` (`id_evaluacion`, `id_curso_periodo`),
  CONSTRAINT `calificacion_ibfk_2` FOREIGN KEY (`id_inscripcion`, `id_estudiante`, `id_curso_periodo`) REFERENCES `inscripcion` (`id_inscripcion`, `id_estudiante`, `id_curso_periodo`),
  CONSTRAINT `calificacion_chk_1` CHECK (((`puntaje_obtenido` is null) or (`puntaje_obtenido` >= 0))),
  CONSTRAINT `calificacion_chk_2` CHECK (((`nota` is null) or ((`nota` >= 1) and (`nota` <= 7))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `calificacion`
--

LOCK TABLES `calificacion` WRITE;
/*!40000 ALTER TABLE `calificacion` DISABLE KEYS */;
/*!40000 ALTER TABLE `calificacion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `curso`
--

DROP TABLE IF EXISTS `curso`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `curso` (
  `id_curso` int NOT NULL AUTO_INCREMENT,
  `nivel` varchar(30) NOT NULL,
  `seccion` varchar(10) NOT NULL,
  `jornada` varchar(20) DEFAULT NULL,
  `sala` varchar(20) DEFAULT NULL,
  `estado` char(1) NOT NULL DEFAULT 'A',
  PRIMARY KEY (`id_curso`),
  CONSTRAINT `curso_chk_1` CHECK ((`estado` in (_utf8mb4'A',_utf8mb4'I')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `curso`
--

LOCK TABLES `curso` WRITE;
/*!40000 ALTER TABLE `curso` DISABLE KEYS */;
/*!40000 ALTER TABLE `curso` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `curso_asignatura`
--

DROP TABLE IF EXISTS `curso_asignatura`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `curso_asignatura` (
  `id_curso_asig` int NOT NULL AUTO_INCREMENT,
  `id_curso_periodo` int NOT NULL,
  `id_asignatura` int NOT NULL,
  `id_profesor` int NOT NULL,
  PRIMARY KEY (`id_curso_asig`),
  UNIQUE KEY `id_curso_periodo` (`id_curso_periodo`,`id_asignatura`),
  UNIQUE KEY `id_curso_asig` (`id_curso_asig`,`id_curso_periodo`),
  KEY `id_asignatura` (`id_asignatura`),
  KEY `id_profesor` (`id_profesor`),
  CONSTRAINT `curso_asignatura_ibfk_1` FOREIGN KEY (`id_curso_periodo`) REFERENCES `curso_periodo` (`id_curso_periodo`),
  CONSTRAINT `curso_asignatura_ibfk_2` FOREIGN KEY (`id_asignatura`) REFERENCES `asignatura` (`id_asignatura`),
  CONSTRAINT `curso_asignatura_ibfk_3` FOREIGN KEY (`id_profesor`) REFERENCES `profesor` (`id_profesor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `curso_asignatura`
--

LOCK TABLES `curso_asignatura` WRITE;
/*!40000 ALTER TABLE `curso_asignatura` DISABLE KEYS */;
/*!40000 ALTER TABLE `curso_asignatura` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `curso_periodo`
--

DROP TABLE IF EXISTS `curso_periodo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `curso_periodo` (
  `id_curso_periodo` int NOT NULL AUTO_INCREMENT,
  `id_curso` int NOT NULL,
  `id_periodo` int NOT NULL,
  PRIMARY KEY (`id_curso_periodo`),
  UNIQUE KEY `id_curso` (`id_curso`,`id_periodo`),
  UNIQUE KEY `id_curso_periodo` (`id_curso_periodo`,`id_periodo`),
  KEY `id_periodo` (`id_periodo`),
  CONSTRAINT `curso_periodo_ibfk_1` FOREIGN KEY (`id_curso`) REFERENCES `curso` (`id_curso`),
  CONSTRAINT `curso_periodo_ibfk_2` FOREIGN KEY (`id_periodo`) REFERENCES `periodo_academico` (`id_periodo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `curso_periodo`
--

LOCK TABLES `curso_periodo` WRITE;
/*!40000 ALTER TABLE `curso_periodo` DISABLE KEYS */;
/*!40000 ALTER TABLE `curso_periodo` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `estudiante`
--

DROP TABLE IF EXISTS `estudiante`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `estudiante` (
  `id_estudiante` int NOT NULL AUTO_INCREMENT,
  `id_persona` int NOT NULL,
  `estado` char(1) NOT NULL DEFAULT 'A',
  PRIMARY KEY (`id_estudiante`),
  UNIQUE KEY `id_persona` (`id_persona`),
  CONSTRAINT `estudiante_ibfk_1` FOREIGN KEY (`id_persona`) REFERENCES `persona` (`id_persona`),
  CONSTRAINT `estudiante_chk_1` CHECK ((`estado` in (_utf8mb4'A',_utf8mb4'I')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `estudiante`
--

LOCK TABLES `estudiante` WRITE;
/*!40000 ALTER TABLE `estudiante` DISABLE KEYS */;
/*!40000 ALTER TABLE `estudiante` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `evaluacion`
--

DROP TABLE IF EXISTS `evaluacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `evaluacion` (
  `id_evaluacion` int NOT NULL AUTO_INCREMENT,
  `id_curso_asig` int NOT NULL,
  `id_curso_periodo` int NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `tipo` varchar(50) NOT NULL,
  `fecha` date NOT NULL,
  `puntaje_maximo` decimal(5,2) NOT NULL,
  `porcentaje` decimal(5,2) NOT NULL,
  `estado` char(1) NOT NULL DEFAULT 'A',
  PRIMARY KEY (`id_evaluacion`),
  UNIQUE KEY `id_evaluacion` (`id_evaluacion`,`id_curso_periodo`),
  KEY `id_curso_asig` (`id_curso_asig`,`id_curso_periodo`),
  CONSTRAINT `evaluacion_ibfk_1` FOREIGN KEY (`id_curso_asig`, `id_curso_periodo`) REFERENCES `curso_asignatura` (`id_curso_asig`, `id_curso_periodo`),
  CONSTRAINT `evaluacion_chk_1` CHECK ((`puntaje_maximo` > 0)),
  CONSTRAINT `evaluacion_chk_2` CHECK (((`porcentaje` > 0) and (`porcentaje` <= 100))),
  CONSTRAINT `evaluacion_chk_3` CHECK ((`estado` in (_utf8mb4'A',_utf8mb4'I')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `evaluacion`
--

LOCK TABLES `evaluacion` WRITE;
/*!40000 ALTER TABLE `evaluacion` DISABLE KEYS */;
/*!40000 ALTER TABLE `evaluacion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fudei`
--

DROP TABLE IF EXISTS `fudei`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fudei` (
  `id_fudei` int NOT NULL AUTO_INCREMENT,
  `id_estudiante` int NOT NULL,
  `id_periodo` int NOT NULL,
  `id_tipo_nee` int NOT NULL,
  `fecha_evaluacion` date NOT NULL,
  `fecha_vencimiento` date DEFAULT NULL,
  `id_coordinador` int NOT NULL,
  `id_director` int NOT NULL,
  `estado` enum('EN_PROCESO','FINALIZADO') NOT NULL DEFAULT 'EN_PROCESO',
  `fecha_finalizacion` datetime DEFAULT NULL,
  `fecha_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_fudei`),
  UNIQUE KEY `id_estudiante` (`id_estudiante`,`id_periodo`),
  KEY `id_periodo` (`id_periodo`),
  KEY `id_tipo_nee` (`id_tipo_nee`),
  KEY `id_coordinador` (`id_coordinador`),
  KEY `id_director` (`id_director`),
  CONSTRAINT `fudei_ibfk_1` FOREIGN KEY (`id_estudiante`) REFERENCES `estudiante` (`id_estudiante`),
  CONSTRAINT `fudei_ibfk_2` FOREIGN KEY (`id_periodo`) REFERENCES `periodo_academico` (`id_periodo`),
  CONSTRAINT `fudei_ibfk_3` FOREIGN KEY (`id_tipo_nee`) REFERENCES `tipo_nee` (`id_tipo_nee`),
  CONSTRAINT `fudei_ibfk_4` FOREIGN KEY (`id_coordinador`) REFERENCES `usuario` (`id_usuario`),
  CONSTRAINT `fudei_ibfk_5` FOREIGN KEY (`id_director`) REFERENCES `usuario` (`id_usuario`),
  CONSTRAINT `fudei_chk_1` CHECK (((`fecha_vencimiento` is null) or (`fecha_vencimiento` >= `fecha_evaluacion`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fudei`
--

LOCK TABLES `fudei` WRITE;
/*!40000 ALTER TABLE `fudei` DISABLE KEYS */;
/*!40000 ALTER TABLE `fudei` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fudei_apoyo`
--

DROP TABLE IF EXISTS `fudei_apoyo`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fudei_apoyo` (
  `id_apoyo` int NOT NULL AUTO_INCREMENT,
  `id_fudei` int NOT NULL,
  `area_apoyo` varchar(100) NOT NULL,
  `descripcion_intervencion` text NOT NULL,
  `frecuencia_semanal_hrs` decimal(3,1) NOT NULL,
  PRIMARY KEY (`id_apoyo`),
  KEY `id_fudei` (`id_fudei`),
  CONSTRAINT `fudei_apoyo_ibfk_1` FOREIGN KEY (`id_fudei`) REFERENCES `fudei` (`id_fudei`) ON DELETE CASCADE,
  CONSTRAINT `fudei_apoyo_chk_1` CHECK ((`frecuencia_semanal_hrs` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fudei_apoyo`
--

LOCK TABLES `fudei_apoyo` WRITE;
/*!40000 ALTER TABLE `fudei_apoyo` DISABLE KEYS */;
/*!40000 ALTER TABLE `fudei_apoyo` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fudei_equipo_evaluador`
--

DROP TABLE IF EXISTS `fudei_equipo_evaluador`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fudei_equipo_evaluador` (
  `id_equipo_evaluador` int NOT NULL AUTO_INCREMENT,
  `id_fudei` int NOT NULL,
  `id_persona` int DEFAULT NULL,
  `nombre_completo` varchar(150) NOT NULL,
  `rol_profesional` varchar(100) NOT NULL,
  `registro_profesional` varchar(50) NOT NULL,
  `fecha_evaluacion` date NOT NULL,
  PRIMARY KEY (`id_equipo_evaluador`),
  KEY `id_fudei` (`id_fudei`),
  KEY `id_persona` (`id_persona`),
  CONSTRAINT `fudei_equipo_evaluador_ibfk_1` FOREIGN KEY (`id_fudei`) REFERENCES `fudei` (`id_fudei`) ON DELETE CASCADE,
  CONSTRAINT `fudei_equipo_evaluador_ibfk_2` FOREIGN KEY (`id_persona`) REFERENCES `persona` (`id_persona`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fudei_equipo_evaluador`
--

LOCK TABLES `fudei_equipo_evaluador` WRITE;
/*!40000 ALTER TABLE `fudei_equipo_evaluador` DISABLE KEYS */;
/*!40000 ALTER TABLE `fudei_equipo_evaluador` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fudei_sintesis_evaluacion`
--

DROP TABLE IF EXISTS `fudei_sintesis_evaluacion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fudei_sintesis_evaluacion` (
  `id_sintesis` int NOT NULL AUTO_INCREMENT,
  `id_fudei` int NOT NULL,
  `sintesis_salud` text NOT NULL,
  `sintesis_psicoeducativa` text NOT NULL,
  `sintesis_escolar` text NOT NULL,
  `sintesis_social_familiar` text NOT NULL,
  PRIMARY KEY (`id_sintesis`),
  UNIQUE KEY `id_fudei` (`id_fudei`),
  CONSTRAINT `fudei_sintesis_evaluacion_ibfk_1` FOREIGN KEY (`id_fudei`) REFERENCES `fudei` (`id_fudei`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fudei_sintesis_evaluacion`
--

LOCK TABLES `fudei_sintesis_evaluacion` WRITE;
/*!40000 ALTER TABLE `fudei_sintesis_evaluacion` DISABLE KEYS */;
/*!40000 ALTER TABLE `fudei_sintesis_evaluacion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inscripcion`
--

DROP TABLE IF EXISTS `inscripcion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inscripcion` (
  `id_inscripcion` int NOT NULL AUTO_INCREMENT,
  `id_estudiante` int NOT NULL,
  `id_curso_periodo` int NOT NULL,
  `id_periodo` int NOT NULL,
  `fecha_inscripcion` date NOT NULL,
  `estado` char(1) NOT NULL DEFAULT 'A',
  PRIMARY KEY (`id_inscripcion`),
  UNIQUE KEY `id_estudiante` (`id_estudiante`,`id_curso_periodo`),
  UNIQUE KEY `id_inscripcion` (`id_inscripcion`,`id_estudiante`,`id_curso_periodo`),
  UNIQUE KEY `id_inscripcion_2` (`id_inscripcion`,`id_estudiante`,`id_periodo`),
  KEY `id_curso_periodo` (`id_curso_periodo`,`id_periodo`),
  KEY `id_periodo` (`id_periodo`),
  CONSTRAINT `inscripcion_ibfk_1` FOREIGN KEY (`id_estudiante`) REFERENCES `estudiante` (`id_estudiante`),
  CONSTRAINT `inscripcion_ibfk_2` FOREIGN KEY (`id_curso_periodo`, `id_periodo`) REFERENCES `curso_periodo` (`id_curso_periodo`, `id_periodo`),
  CONSTRAINT `inscripcion_ibfk_3` FOREIGN KEY (`id_periodo`) REFERENCES `periodo_academico` (`id_periodo`),
  CONSTRAINT `inscripcion_chk_1` CHECK ((`estado` in (_utf8mb4'A',_utf8mb4'I')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inscripcion`
--

LOCK TABLES `inscripcion` WRITE;
/*!40000 ALTER TABLE `inscripcion` DISABLE KEYS */;
/*!40000 ALTER TABLE `inscripcion` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `periodo_academico`
--

DROP TABLE IF EXISTS `periodo_academico`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `periodo_academico` (
  `id_periodo` int NOT NULL AUTO_INCREMENT,
  `año` int NOT NULL,
  `semestre` int NOT NULL,
  `fecha_inicio` date NOT NULL,
  `fecha_fin` date NOT NULL,
  `estado` char(1) NOT NULL DEFAULT 'A',
  PRIMARY KEY (`id_periodo`),
  UNIQUE KEY `año` (`año`,`semestre`),
  CONSTRAINT `periodo_academico_chk_1` CHECK ((`semestre` in (1,2))),
  CONSTRAINT `periodo_academico_chk_2` CHECK ((`fecha_fin` >= `fecha_inicio`)),
  CONSTRAINT `periodo_academico_chk_3` CHECK ((`estado` in (_utf8mb4'A',_utf8mb4'I')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `periodo_academico`
--

LOCK TABLES `periodo_academico` WRITE;
/*!40000 ALTER TABLE `periodo_academico` DISABLE KEYS */;
/*!40000 ALTER TABLE `periodo_academico` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `persona`
--

DROP TABLE IF EXISTS `persona`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `persona` (
  `id_persona` int NOT NULL AUTO_INCREMENT,
  `rut` varchar(12) NOT NULL,
  `nombre` varchar(50) NOT NULL,
  `apellido` varchar(50) NOT NULL,
  `fecha_nacimiento` date DEFAULT NULL,
  `genero` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`id_persona`),
  UNIQUE KEY `rut` (`rut`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `persona`
--

LOCK TABLES `persona` WRITE;
/*!40000 ALTER TABLE `persona` DISABLE KEYS */;
/*!40000 ALTER TABLE `persona` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `profesor`
--

DROP TABLE IF EXISTS `profesor`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `profesor` (
  `id_profesor` int NOT NULL AUTO_INCREMENT,
  `id_persona` int NOT NULL,
  `especialidad` varchar(100) DEFAULT NULL,
  `telefono` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id_profesor`),
  UNIQUE KEY `id_persona` (`id_persona`),
  CONSTRAINT `profesor_ibfk_1` FOREIGN KEY (`id_persona`) REFERENCES `persona` (`id_persona`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `profesor`
--

LOCK TABLES `profesor` WRITE;
/*!40000 ALTER TABLE `profesor` DISABLE KEYS */;
/*!40000 ALTER TABLE `profesor` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `rol`
--

DROP TABLE IF EXISTS `rol`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `rol` (
  `id_rol` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id_rol`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `rol`
--

LOCK TABLES `rol` WRITE;
/*!40000 ALTER TABLE `rol` DISABLE KEYS */;
INSERT INTO `rol` VALUES (1,'Administrador','Administra el sistema'),(2,'Profesor','Gestiona informacion academica'),(3,'Estudiante','Consulta su informacion academica'),(4,'Apoderado','Consulta informacion del estudiante');
/*!40000 ALTER TABLE `rol` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sesion_clase`
--

DROP TABLE IF EXISTS `sesion_clase`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sesion_clase` (
  `id_sesion` int NOT NULL AUTO_INCREMENT,
  `id_curso_asig` int NOT NULL,
  `id_curso_periodo` int NOT NULL,
  `fecha` date NOT NULL,
  `hora_inicio` time NOT NULL,
  `hora_fin` time NOT NULL,
  `sala` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id_sesion`),
  UNIQUE KEY `id_sesion` (`id_sesion`,`id_curso_periodo`),
  KEY `id_curso_asig` (`id_curso_asig`,`id_curso_periodo`),
  CONSTRAINT `sesion_clase_ibfk_1` FOREIGN KEY (`id_curso_asig`, `id_curso_periodo`) REFERENCES `curso_asignatura` (`id_curso_asig`, `id_curso_periodo`),
  CONSTRAINT `sesion_clase_chk_1` CHECK ((`hora_fin` > `hora_inicio`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sesion_clase`
--

LOCK TABLES `sesion_clase` WRITE;
/*!40000 ALTER TABLE `sesion_clase` DISABLE KEYS */;
/*!40000 ALTER TABLE `sesion_clase` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tipo_nee`
--

DROP TABLE IF EXISTS `tipo_nee`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tipo_nee` (
  `id_tipo_nee` int NOT NULL AUTO_INCREMENT,
  `clasificacion` enum('NEET','NEEP') NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id_tipo_nee`),
  UNIQUE KEY `nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tipo_nee`
--

LOCK TABLES `tipo_nee` WRITE;
/*!40000 ALTER TABLE `tipo_nee` DISABLE KEYS */;
/*!40000 ALTER TABLE `tipo_nee` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuario`
--

DROP TABLE IF EXISTS `usuario`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuario` (
  `id_usuario` int NOT NULL AUTO_INCREMENT,
  `id_persona` int NOT NULL,
  `correo` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `estado` char(1) NOT NULL DEFAULT 'A',
  `fecha_creacion` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_usuario`),
  UNIQUE KEY `id_persona` (`id_persona`),
  UNIQUE KEY `correo` (`correo`),
  CONSTRAINT `usuario_ibfk_1` FOREIGN KEY (`id_persona`) REFERENCES `persona` (`id_persona`),
  CONSTRAINT `usuario_chk_1` CHECK ((`estado` in (_utf8mb4'A',_utf8mb4'I')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuario`
--

LOCK TABLES `usuario` WRITE;
/*!40000 ALTER TABLE `usuario` DISABLE KEYS */;
/*!40000 ALTER TABLE `usuario` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `usuario_rol`
--

DROP TABLE IF EXISTS `usuario_rol`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usuario_rol` (
  `id_usuario` int NOT NULL,
  `id_rol` int NOT NULL,
  PRIMARY KEY (`id_usuario`,`id_rol`),
  KEY `id_rol` (`id_rol`),
  CONSTRAINT `usuario_rol_ibfk_1` FOREIGN KEY (`id_usuario`) REFERENCES `usuario` (`id_usuario`),
  CONSTRAINT `usuario_rol_ibfk_2` FOREIGN KEY (`id_rol`) REFERENCES `rol` (`id_rol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `usuario_rol`
--

LOCK TABLES `usuario_rol` WRITE;
/*!40000 ALTER TABLE `usuario_rol` DISABLE KEYS */;
/*!40000 ALTER TABLE `usuario_rol` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Datos de prueba para pruebas de funcionalidad
--

INSERT INTO PERSONA (rut, nombre, apellido, fecha_nacimiento, genero) VALUES
('11111111-1', 'Ana', 'Administrador', '1985-03-10', 'Femenino'),
('22222222-2', 'Pedro', 'Profesor', '1980-07-15', 'Masculino'),
('33333333-3', 'Juan', 'Perez', '2009-04-20', 'Masculino'),
('44444444-4', 'Maria', 'Gonzalez', '2009-09-11', 'Femenino'),
('55555555-5', 'Laura', 'Perez', '1982-01-25', 'Femenino');

INSERT INTO USUARIO (id_persona, correo, password)
SELECT id_persona, 'ana@educare.cl', 'hash_demo' FROM PERSONA WHERE rut = '11111111-1';

INSERT INTO USUARIO (id_persona, correo, password)
SELECT id_persona, 'pedro@educare.cl', 'hash_demo' FROM PERSONA WHERE rut = '22222222-2';

INSERT INTO USUARIO (id_persona, correo, password)
SELECT id_persona, 'juan@educare.cl', 'hash_demo' FROM PERSONA WHERE rut = '33333333-3';

INSERT INTO USUARIO (id_persona, correo, password)
SELECT id_persona, 'maria@educare.cl', 'hash_demo' FROM PERSONA WHERE rut = '44444444-4';

INSERT INTO USUARIO (id_persona, correo, password)
SELECT id_persona, 'laura@educare.cl', 'hash_demo' FROM PERSONA WHERE rut = '55555555-5';

INSERT INTO USUARIO_ROL (id_usuario, id_rol)
SELECT u.id_usuario, r.id_rol FROM USUARIO u, ROL r WHERE u.correo = 'ana@educare.cl' AND r.nombre = 'Administrador';

INSERT INTO USUARIO_ROL (id_usuario, id_rol)
SELECT u.id_usuario, r.id_rol FROM USUARIO u, ROL r WHERE u.correo = 'pedro@educare.cl' AND r.nombre = 'Profesor';

INSERT INTO USUARIO_ROL (id_usuario, id_rol)
SELECT u.id_usuario, r.id_rol FROM USUARIO u, ROL r WHERE u.correo = 'juan@educare.cl' AND r.nombre = 'Estudiante';

INSERT INTO USUARIO_ROL (id_usuario, id_rol)
SELECT u.id_usuario, r.id_rol FROM USUARIO u, ROL r WHERE u.correo = 'maria@educare.cl' AND r.nombre = 'Estudiante';

INSERT INTO USUARIO_ROL (id_usuario, id_rol)
SELECT u.id_usuario, r.id_rol FROM USUARIO u, ROL r WHERE u.correo = 'laura@educare.cl' AND r.nombre = 'Apoderado';

INSERT INTO PROFESOR (id_persona, especialidad, telefono)
SELECT id_persona, 'Matematica', '912345678' FROM PERSONA WHERE rut = '22222222-2';

INSERT INTO ESTUDIANTE (id_persona)
SELECT id_persona FROM PERSONA WHERE rut IN ('33333333-3', '44444444-4');

INSERT INTO APODERADO (id_persona, telefono)
SELECT id_persona, '987654321' FROM PERSONA WHERE rut = '55555555-5';

INSERT INTO APODERADO_ESTUDIANTE (id_apoderado, id_estudiante, parentesco)
SELECT ap.id_apoderado, es.id_estudiante, 'Madre'
FROM APODERADO ap
INNER JOIN PERSONA pp ON pp.id_persona = ap.id_persona
INNER JOIN ESTUDIANTE es
INNER JOIN PERSONA pe ON pe.id_persona = es.id_persona
WHERE pp.rut = '55555555-5' AND pe.rut = '33333333-3';

INSERT INTO PERIODO_ACADEMICO (año, semestre, fecha_inicio, fecha_fin)
VALUES (2026, 1, '2026-03-01', '2026-07-31');

INSERT INTO CURSO (nivel, seccion, jornada, sala)
VALUES ('IV Medio', 'A', 'Mañana', '101');

INSERT INTO CURSO_PERIODO (id_curso, id_periodo)
SELECT c.id_curso, p.id_periodo FROM CURSO c, PERIODO_ACADEMICO p WHERE c.seccion = 'A' AND p.año = 2026 AND p.semestre = 1;

INSERT INTO ASIGNATURA (codigo, nombre, descripcion) VALUES
('MAT01', 'Matematica', 'Asignatura de matematica'),
('LEN01', 'Lenguaje', 'Asignatura de lenguaje');

INSERT INTO CURSO_ASIGNATURA (id_curso_periodo, id_asignatura, id_profesor)
SELECT cp.id_curso_periodo, a.id_asignatura, pr.id_profesor
FROM CURSO_PERIODO cp
INNER JOIN ASIGNATURA a ON a.codigo = 'MAT01'
INNER JOIN PROFESOR pr
INNER JOIN PERSONA p ON p.id_persona = pr.id_persona
WHERE p.rut = '22222222-2';

INSERT INTO CURSO_ASIGNATURA (id_curso_periodo, id_asignatura, id_profesor)
SELECT cp.id_curso_periodo, a.id_asignatura, pr.id_profesor
FROM CURSO_PERIODO cp
INNER JOIN ASIGNATURA a ON a.codigo = 'LEN01'
INNER JOIN PROFESOR pr
INNER JOIN PERSONA p ON p.id_persona = pr.id_persona
WHERE p.rut = '22222222-2';

INSERT INTO INSCRIPCION (id_estudiante, id_curso_periodo, id_periodo, fecha_inscripcion)
SELECT es.id_estudiante, cp.id_curso_periodo, cp.id_periodo, '2026-03-01'
FROM ESTUDIANTE es
INNER JOIN PERSONA pe ON pe.id_persona = es.id_persona
INNER JOIN CURSO_PERIODO cp
WHERE pe.rut = '33333333-3';

INSERT INTO SESION_CLASE (id_curso_asig, id_curso_periodo, fecha, hora_inicio, hora_fin, sala)
SELECT ca.id_curso_asig, ca.id_curso_periodo, '2026-04-10', '08:00:00', '09:30:00', '101'
FROM CURSO_ASIGNATURA ca INNER JOIN ASIGNATURA a ON a.id_asignatura = ca.id_asignatura WHERE a.codigo = 'MAT01';

INSERT INTO SESION_CLASE (id_curso_asig, id_curso_periodo, fecha, hora_inicio, hora_fin, sala)
SELECT ca.id_curso_asig, ca.id_curso_periodo, '2026-04-10', '10:00:00', '11:30:00', '101'
FROM CURSO_ASIGNATURA ca INNER JOIN ASIGNATURA a ON a.id_asignatura = ca.id_asignatura WHERE a.codigo = 'MAT01';

INSERT INTO ASISTENCIA (id_sesion, id_estudiante, id_inscripcion, id_curso_periodo, estado)
SELECT s.id_sesion, e.id_estudiante, i.id_inscripcion, i.id_curso_periodo, 'Presente'
FROM SESION_CLASE s
INNER JOIN CURSO_ASIGNATURA ca ON ca.id_curso_asig = s.id_curso_asig
INNER JOIN ASIGNATURA a ON a.id_asignatura = ca.id_asignatura
INNER JOIN INSCRIPCION i ON i.id_curso_periodo = s.id_curso_periodo
INNER JOIN ESTUDIANTE e ON e.id_estudiante = i.id_estudiante
INNER JOIN PERSONA p ON p.id_persona = e.id_persona
WHERE a.codigo = 'MAT01' AND p.rut = '33333333-3';

INSERT INTO EVALUACION (id_curso_asig, id_curso_periodo, nombre, descripcion, tipo, fecha, puntaje_maximo, porcentaje)
SELECT ca.id_curso_asig, ca.id_curso_periodo, 'Prueba Unidad 1', 'Primera evaluacion de matematica', 'Prueba', '2026-04-20', 100, 30
FROM CURSO_ASIGNATURA ca INNER JOIN ASIGNATURA a ON a.id_asignatura = ca.id_asignatura WHERE a.codigo = 'MAT01';

INSERT INTO CALIFICACION (id_evaluacion, id_estudiante, id_inscripcion, id_curso_periodo, puntaje_obtenido, nota, observacion)
SELECT ev.id_evaluacion, e.id_estudiante, i.id_inscripcion, i.id_curso_periodo, 80, 5.8, 'Buen resultado'
FROM EVALUACION ev
INNER JOIN CURSO_ASIGNATURA ca ON ca.id_curso_asig = ev.id_curso_asig
INNER JOIN ASIGNATURA a ON a.id_asignatura = ca.id_asignatura
INNER JOIN INSCRIPCION i ON i.id_curso_periodo = ev.id_curso_periodo
INNER JOIN ESTUDIANTE e ON e.id_estudiante = i.id_estudiante
INNER JOIN PERSONA p ON p.id_persona = e.id_persona
WHERE a.codigo = 'MAT01' AND p.rut = '33333333-3';

INSERT INTO AVISO (id_usuario, titulo, contenido, prioridad)
SELECT id_usuario, 'Reunion general', 'Reunion informativa para la comunidad educativa.', 'Alta'
FROM USUARIO WHERE correo = 'ana@educare.cl';

INSERT INTO AVISO_DESTINATARIO (id_aviso, tipo_destino)
SELECT id_aviso, 'GLOBAL' FROM AVISO WHERE titulo = 'Reunion general';

INSERT INTO AVISO_DESTINATARIO (id_aviso, tipo_destino, id_rol)
SELECT a.id_aviso, 'ROL', r.id_rol FROM AVISO a, ROL r WHERE a.titulo = 'Reunion general' AND r.nombre = 'Apoderado';

INSERT INTO AUDITORIA (id_usuario, accion, tabla_afectada, id_registro, descripcion)
SELECT id_usuario, 'INSERT', 'CALIFICACION', 1, 'Registro de calificacion de prueba'
FROM USUARIO WHERE correo = 'pedro@educare.cl';

-- Inserción de Catálogo de Diagnósticos NEE 
INSERT INTO TIPO_NEE (clasificacion, nombre, descripcion) VALUES
('NEET', 'Trastorno Específico del Lenguaje (TEL)', 'Dificultades en la adquisición y desarrollo del lenguaje hablado.'),
('NEET', 'Trastorno por Déficit de Atención (TDA/TDAH)', 'Dificultades de atención con o sin hiperactividad.'),
('NEET', 'Dificultades Específicas del Aprendizaje (DEA)', 'Dificultades lectoescritoras o de cálculo aritmético.'),
('NEEP', 'Trastorno del Espectro Autista (TEA)', 'Condición del neurodesarrollo que afecta comunicación e interacción.'),
('NEEP', 'Discapacidad Intelectual', 'Limitaciones significativas en el funcionamiento intelectual y conducta adaptativa.'),
('NEEP', 'Discapacidad Múltiple', 'Coexistencia de dos o más discapacidades.');

-- Inserción de un FUDEI de Prueba
INSERT INTO FUDEI (id_estudiante, id_periodo, id_tipo_nee, fecha_evaluacion, fecha_vencimiento, id_coordinador, id_director, estado)
SELECT 
    e.id_estudiante, 
    p.id_periodo, 
    tn.id_tipo_nee, 
    '2026-03-05', 
    '2026-12-31', 
    u_admin.id_usuario, 
    u_admin.id_usuario,
    'EN_PROCESO'
FROM ESTUDIANTE e
INNER JOIN PERSONA pe ON pe.id_persona = e.id_persona
INNER JOIN PERIODO_ACADEMICO p ON p.año = 2026 AND p.semestre = 1
INNER JOIN TIPO_NEE tn ON tn.nombre LIKE 'Trastorno del Espectro Autista%'
INNER JOIN USUARIO u_admin ON u_admin.correo = 'ana@educare.cl'
WHERE pe.rut = '33333333-3';

-- Carga de Síntesis diagnóstica
INSERT INTO FUDEI_SINTESIS_EVALUACION (id_fudei, sintesis_salud, sintesis_psicoeducativa, sintesis_escolar, sintesis_social_familiar)
VALUES (
    1,
    'Examen auditivo y visual dentro de rangos normales. Control con neurólogo al día.',
    'Presenta ritmo de aprendizaje adaptado. Fortalezas en memoria visual y razonamiento lógico.',
    'Requiere anticipación de rutinas y apoyos visuales en el aula de clases.',
    'Familia comprometida con el proceso de integración escolar y asistencia a citaciones.'
);

-- Carga de Profesionales del Equipo Evaluador
INSERT INTO FUDEI_EQUIPO_EVALUADOR (id_fudei, id_persona, nombre_completo, rol_profesional, registro_profesional, fecha_evaluacion)
VALUES 
(1, NULL, 'Carolina Martínez', 'Educadora Diferencial', 'SEC-88431', '2026-03-02'),
(1, NULL, 'Gonzalo Morales', 'Psicólogo Clínico/Educacional', 'MINSAL-44120', '2026-03-04');

-- Carga de Plan de Apoyos
INSERT INTO FUDEI_APOYO (id_fudei, area_apoyo, descripcion_intervencion, frecuencia_semanal_hrs)
VALUES 
(1, 'Adaptación Curricular', 'Adecuación de evaluaciones y material educativo estructurado.', 4.0),
(1, 'Apoyo Psicoeducativo', 'Taller de habilidades sociales y autorregulación emocional en Aula de Recursos.', 2.0);

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-05  0:27:22
