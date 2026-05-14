# 🏆 Polla Mundial 2026

App completa para la polla mundialista entre compañeros de trabajo. Incluye backend Node.js + SQLite, frontend HTML/CSS/JS, autenticación con JWT, predicciones partido a partido, apuestas diarias y panel de administrador.

## 📋 Características

- ✅ Registro y login de usuarios con contraseña encriptada
- ✅ Predicciones de todos los partidos de la fase de grupos (12 grupos × 6 partidos = 72 partidos)
- ✅ Predicciones de eliminatorias (octavos a final)
- ✅ Predicción del podio (campeón, subcampeón, 3er lugar)
- ✅ Apuestas diarias ($1 o $2 por partido) independientes de la polla general
- ✅ Ranking en tiempo real con cálculo automático de puntos
- ✅ Banderas y colores de todos los países
- ✅ Panel de admin: editar resultados, gestionar usuarios, resetear contraseñas, marcar pagos
- ✅ Modo oscuro automático
- ✅ Responsive (móvil y desktop)

## 💰 Sistema de premios

**Pozo principal** ($10 por participante): se reparte 50/30/20% entre los 3 primeros del ranking.

**Apuestas diarias** ($1 o $2 por partido): el pote del partido se reparte entre quienes acierten el marcador exacto.

## 🎯 Sistema de puntos (polla general)

### Fase de grupos
- 🎯 Marcador exacto: **5 puntos**
- 📏 Ganador + diferencia correcta: **3 puntos**
- ✅ Solo ganador correcto: **2 puntos**
- 🤝 Empate exacto: **3 puntos**

### Eliminatorias
- ✅ Ganador correcto: **4 puntos**
- 🎯 Ganador + marcador exacto: **6 puntos**

### Podio final
- 🥇 Campeón: **15 puntos**
- 🥈 Subcampeón: **10 puntos**
- 🥉 Tercer lugar: **6 puntos**

## 🚀 Instalación local

Requisitos: Node.js 20+ y npm.

```bash
cd backend
cp .env.example .env
# edita .env y cambia JWT_SECRET por una cadena aleatoria larga
npm install
npm run init-db
npm start
```

La app estará disponible en `http://localhost:3000`.

**Admin por defecto:** usuario `admin`, contraseña `admin123`. Cámbiala inmediatamente al entrar.

## 🌐 Despliegue en Railway (recomendado, gratis)

1. Crea una cuenta en [railway.com](https://railway.com).
2. Sube este proyecto a GitHub (repo público o privado).
3. En Railway: `New Project → Deploy from GitHub repo` → selecciona tu repo.
4. Railway detectará el archivo `railway.json` y construirá el proyecto automáticamente.
5. En la pestaña `Variables` agrega:
   - `JWT_SECRET`: una cadena aleatoria larga (ej: genera una en [passwordsgenerator.net](https://passwordsgenerator.net/)).
6. En la pestaña `Settings → Networking` activa `Generate Domain` para obtener la URL pública.
7. (Importante) En la pestaña `Volumes`, crea un volumen montado en `/app/backend/db` con 1GB para que la base de datos persista entre despliegues.

Comparte la URL generada con tus compañeros y listo.

## 🌐 Despliegue alternativo en Render

1. Crea una cuenta en [render.com](https://render.com).
2. Sube este proyecto a GitHub.
3. En Render: `New → Blueprint` → selecciona tu repo.
4. Render detectará `render.yaml` y desplegará automáticamente con un disco persistente de 1GB.

## 👤 Cómo funciona para tus compañeros

1. Entran a la URL que compartiste.
2. Se registran con un usuario, su nombre completo y contraseña.
3. Llenan sus predicciones de grupos, eliminatorias y podio.
4. Cada día pueden apostar en los partidos del día (opcional).
5. Ven el ranking actualizado en tiempo real.

## 🛠️ Cómo funciona para ti (admin)

Entras con el usuario `admin` y ves una pestaña extra "Admin" con tres secciones:

1. **Cargar resultados**: después de cada partido, ingresas el marcador real. Los puntos se calculan automáticamente.
2. **Podio real**: al terminar el mundial, marcas el podio oficial para cerrar la puntuación.
3. **Participantes**: puedes:
   - Editar el nombre o usuario de cualquiera (si alguien se equivocó al registrarse)
   - Marcar/desmarcar quién ya pagó los $10 de inscripción
   - Resetear la contraseña de alguien
   - Eliminar cuentas

## 📁 Estructura del proyecto

```
polla-mundial/
├── backend/
│   ├── data/worldCupData.js    # Países, grupos, fixture
│   ├── db/polla.db             # Base de datos SQLite (auto-generada)
│   ├── initDb.js               # Script de inicialización
│   ├── scoring.js              # Sistema de puntos
│   ├── server.js               # API Express
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── index.html              # SPA
│   ├── styles.css              # Estilos
│   └── app.js                  # Lógica frontend
├── railway.json                # Config Railway
├── render.yaml                 # Config Render
├── .gitignore
└── README.md
```

## 🔒 Seguridad

- Contraseñas encriptadas con bcrypt (10 rounds)
- Autenticación con JWT (expira en 30 días)
- Validación de predicciones: no se pueden editar después de que el partido inicie
- Solo admins pueden cargar resultados reales
- CORS habilitado, HTTPS automático en Railway/Render

## 🐛 Troubleshooting

**La base de datos se pierde al redesplegar**: asegúrate de tener un volumen persistente configurado (ver secciones de despliegue).

**Olvidé mi contraseña de admin**: conéctate por SSH a Railway/Render y ejecuta:
```bash
cd backend && node -e "require('better-sqlite3')('./db/polla.db').prepare('UPDATE users SET password_hash=? WHERE username=?').run(require('bcryptjs').hashSync('nuevaPass',10),'admin')"
```

**Quiero cambiar los equipos o el fixture**: edita `backend/data/worldCupData.js` y borra `backend/db/polla.db`. Luego `npm run init-db` y se regenera todo.

## 📄 Licencia

Libre uso para tu polla. Diviértete con el equipo. 🎉
