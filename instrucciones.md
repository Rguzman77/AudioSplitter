# Proyecto: Audio Stem Separation Platform

## Objetivo

Construir una plataforma profesional de separación de pistas de audio basada en IA.

La plataforma deberá permitir:

- Subir canciones.
- Procesarlas mediante distintos modelos de separación.
- Obtener stems individuales.
- Descargar resultados.
- Escalar a múltiples usuarios.
- Permitir añadir nuevos modelos sin modificar la aplicación.

El sistema debe diseñarse pensando en producción desde el primer día.

---

# Rol de Claude

Actúa como:

- Principal Software Architect
- AI Engineer
- Backend Engineer
- Frontend Engineer
- DevOps Engineer
- QA Lead

Debes diseñar primero y programar después.

Ningún código debe generarse hasta completar la documentación de arquitectura.

---

# Stack Tecnológico

## Frontend

- React
- Vite
- TypeScript
- Tailwind
- React Query
- Zustand

---

## Backend

- Python 3.12+
- FastAPI
- Pydantic
- SQLAlchemy

---

## IA

- PyTorch
- Demucs
- BS-Roformer
- MelBand-Roformer

Diseñar una arquitectura que permita incorporar futuros modelos.

---

## Base de Datos

MVP:

- SQLite

Producción:

- PostgreSQL

Todo acceso debe pasar por repositorios.

---

## Cola de Trabajos

Evaluar:

- Celery + Redis
- RQ + Redis
- Dramatiq

Seleccionar la mejor opción y justificar.

---

## Almacenamiento

Diseñar Storage Providers:

- LocalStorageProvider
- MinIOStorageProvider
- S3StorageProvider

Toda la aplicación debe usar interfaces abstractas.

---

# Principios Arquitectónicos

## 1

Arquitectura modular.

---

## 2

Separación estricta de responsabilidades.

---

## 3

Dependency Injection.

---

## 4

Clean Architecture.

---

## 5

Provider Pattern.

---

## 6

Preparada para escalar horizontalmente.

---

# Dominios

## Audio Jobs

Gestiona:

- Creación
- Estado
- Historial
- Resultados

---

## AI Engine

Gestiona:

- Modelos
- Inferencia
- GPU
- Conversión de formatos

---

## Storage

Gestiona:

- Uploads
- Descargas
- Stems

---

## User Interface

Gestiona:

- Uploads
- Estado
- Reproductores

---

# Sistema de Proveedores IA

Diseñar desde el inicio:

```python
from abc import ABC

class AIProvider(ABC):

    async def load(self):
        pass

    async def separate(self, input_file):
        pass

    async def health_check(self):
        pass
```

Implementaciones:

```txt
DemucsProvider
BSRoformerProvider
MelBandRoformerProvider
```

Ninguna otra parte del sistema podrá conocer detalles internos del modelo.

---

# Modelos Objetivo

## Fase 1

Demucs

Investigar:

- instalación
- rendimiento
- consumo GPU
- formatos soportados

---

## Fase 2

BS-Roformer

Investigar:

- repositorios activos
- checkpoints
- licencias
- requisitos hardware

---

## Fase 3

MelBand-Roformer

Investigar:

- integración
- rendimiento
- ventajas frente a Demucs

---

# Requisitos Funcionales

## RF-001

Subida de audio.

Formatos:

- mp3
- wav
- flac
- m4a

---

## RF-002

Procesamiento asíncrono.

---

## RF-003

Progreso en tiempo real.

Evaluar:

- WebSockets
- Server Sent Events

---

## RF-004

Descarga de stems.

---

## RF-005

Descarga ZIP.

---

## RF-006

Escucha previa.

---

## RF-007

Selección de modelo IA.

---

## RF-008

Historial de trabajos.

---

## RF-009

Eliminación de trabajos.

---

# Estructura Deseada

```txt
audio-platform/

├── frontend/
│
├── backend/
│
├── ai_engine/
│
├── infrastructure/
│
├── tests/
│
├── docs/
│
└── scripts/
```

---

# Agentes Especializados

## Architecture Agent

Responsable de:

- ADRs
- Diagramas
- Diseño

---

## Backend Agent

Responsable de:

- FastAPI
- SQLAlchemy
- Jobs
- Storage

---

## Frontend Agent

Responsable de:

- React
- UX
- Estado

---

## AI Agent

Responsable de:

- Modelos
- GPU
- Inferencia
- Optimización

---

## DevOps Agent

Responsable de:

- Docker
- Docker Compose
- Deploy GPU

---

## QA Agent

Responsable de:

- Unit Testing
- Integration Testing
- E2E

---

# Docker

Diseñar:

## Desarrollo

```txt
frontend
backend
redis
postgres
```

---

## Producción

```txt
frontend
backend
worker
redis
postgres
nginx
```

---

# GPU

Diseñar soporte para:

- CPU
- CUDA

El sistema debe detectar automáticamente disponibilidad GPU.

---

# Investigación Obligatoria

Claude debe investigar y documentar:

1. Demucs
2. BS-Roformer
3. MelBand-Roformer
4. CUDA
5. PyTorch
6. Estrategias de optimización
7. Caching de modelos
8. Descarga automática de checkpoints

---

# Entregables Iniciales

Antes de generar código:

1. Arquitectura completa.
2. ADRs.
3. Modelo de datos.
4. Contratos API.
5. Diseño de proveedores IA.
6. Estrategia Docker.
7. Roadmap.
8. Plan de despliegue.

Después comenzar implementación.