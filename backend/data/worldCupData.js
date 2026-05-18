const TEAMS = [
  { code: 'MEX', name: 'Mexico', flag: '🇲🇽', color: '#006341' },
  { code: 'RSA', name: 'Sudafrica', flag: '🇿🇦', color: '#007A4D' },
  { code: 'KOR', name: 'Corea del Sur', flag: '🇰🇷', color: '#003478' },
  { code: 'CZE', name: 'Rep. Checa', flag: '🇨🇿', color: '#D7141A' },
  { code: 'CAN', name: 'Canada', flag: '🇨🇦', color: '#FF0000' },
  { code: 'BIH', name: 'Bosnia y Herzegovina', flag: '🇧🇦', color: '#003DA5' },
  { code: 'QAT', name: 'Qatar', flag: '🇶🇦', color: '#8A1538' },
  { code: 'SUI', name: 'Suiza', flag: '🇨🇭', color: '#DA291C' },
  { code: 'BRA', name: 'Brasil', flag: '🇧🇷', color: '#FEDD00' },
  { code: 'MAR', name: 'Marruecos', flag: '🇲🇦', color: '#C1272D' },
  { code: 'HTI', name: 'Haiti', flag: '🇭🇹', color: '#00209F' },
  { code: 'SCO', name: 'Escocia', flag: '🏴', color: '#0065BD' },
  { code: 'USA', name: 'Estados Unidos', flag: '🇺🇸', color: '#002868' },
  { code: 'PAR', name: 'Paraguay', flag: '🇵🇾', color: '#D52B1E' },
  { code: 'AUS', name: 'Australia', flag: '🇦🇺', color: '#FFCD00' },
  { code: 'TUR', name: 'Turquia', flag: '🇹🇷', color: '#E30A17' },
  { code: 'GER', name: 'Alemania', flag: '🇩🇪', color: '#000000' },
  { code: 'CUR', name: 'Curacao', flag: '🇨🇼', color: '#002B7F' },
  { code: 'CIV', name: 'Costa de Marfil', flag: '🇨🇮', color: '#FF8200' },
  { code: 'ECU', name: 'Ecuador', flag: '🇪🇨', color: '#FFD100' },
  { code: 'NED', name: 'Paises Bajos', flag: '🇳🇱', color: '#FF6C00' },
  { code: 'JPN', name: 'Japon', flag: '🇯🇵', color: '#BC002D' },
  { code: 'SWE', name: 'Suecia', flag: '🇸🇪', color: '#006AA7' },
  { code: 'TUN', name: 'Tunez', flag: '🇹🇳', color: '#E70013' },
  { code: 'ESP', name: 'Espana', flag: '🇪🇸', color: '#AA151B' },
  { code: 'CPV', name: 'Cabo Verde', flag: '🇨🇻', color: '#003893' },
  { code: 'KSA', name: 'Arabia Saudita', flag: '🇸🇦', color: '#006C35' },
  { code: 'URU', name: 'Uruguay', flag: '🇺🇾', color: '#4EA5D9' },
  { code: 'BEL', name: 'Belgica', flag: '🇧🇪', color: '#EF3340' },
  { code: 'EGY', name: 'Egipto', flag: '🇪🇬', color: '#CE1126' },
  { code: 'IRN', name: 'Iran', flag: '🇮🇷', color: '#239F40' },
  { code: 'NZL', name: 'Nueva Zelanda', flag: '🇳🇿', color: '#000000' },
  { code: 'FRA', name: 'Francia', flag: '🇫🇷', color: '#0055A4' },
  { code: 'SEN', name: 'Senegal', flag: '🇸🇳', color: '#00853F' },
  { code: 'IRQ', name: 'Iraq', flag: '🇮🇶', color: '#CE1126' },
  { code: 'NOR', name: 'Noruega', flag: '🇳🇴', color: '#BA0C2F' },
  { code: 'ARG', name: 'Argentina', flag: '🇦🇷', color: '#75AADB' },
  { code: 'ALG', name: 'Argelia', flag: '🇩🇿', color: '#006233' },
  { code: 'AUT', name: 'Austria', flag: '🇦🇹', color: '#ED2939' },
  { code: 'JOR', name: 'Jordania', flag: '🇯🇴', color: '#007A3D' },
  { code: 'POR', name: 'Portugal', flag: '🇵🇹', color: '#046A38' },
  { code: 'DRC', name: 'DR Congo', flag: '🇨🇩', color: '#007FFF' },
  { code: 'UZB', name: 'Uzbekistan', flag: '🇺🇿', color: '#1EB53A' },
  { code: 'COL', name: 'Colombia', flag: '🇨🇴', color: '#FCD116' },
  { code: 'ENG', name: 'Inglaterra', flag: '🇬🇧', color: '#CE1124' },
  { code: 'CRO', name: 'Croacia', flag: '🇭🇷', color: '#FF0000' },
  { code: 'GHA', name: 'Ghana', flag: '🇬🇭', color: '#CE1126' },
  { code: 'PAN', name: 'Panama', flag: '🇵🇦', color: '#DA121A' }
];

const GROUPS = {
  'A': ['MEX', 'RSA', 'KOR', 'CZE'],
  'B': ['CAN', 'SUI', 'QAT', 'BIH'],
  'C': ['BRA', 'MAR', 'SCO', 'HTI'],
  'D': ['USA', 'PAR', 'AUS', 'TUR'],
  'E': ['GER', 'CUR', 'CIV', 'ECU'],
  'F': ['NED', 'JPN', 'SWE', 'TUN'],
  'G': ['BEL', 'EGY', 'IRN', 'NZL'],
  'H': ['ESP', 'CPV', 'KSA', 'URU'],
  'I': ['FRA', 'SEN', 'IRQ', 'NOR'],
  'J': ['ARG', 'ALG', 'AUT', 'JOR'],
  'K': ['POR', 'DRC', 'UZB', 'COL'],
  'L': ['ENG', 'CRO', 'GHA', 'PAN']
};

function getTeamByCode(code) {
  return TEAMS.find(t => t.code === code);
}

// Horarios en hora Ecuador (GMT-5) = ET - 1 hora
const GROUP_MATCHES = [
  // Jueves 11 junio
  { id: 'G-A-1', phase: 'groups', group_name: 'A', home_team: 'MEX', away_team: 'RSA', match_date: '2026-06-11', match_time: '14:00' },
  { id: 'G-A-2', phase: 'groups', group_name: 'A', home_team: 'KOR', away_team: 'CZE', match_date: '2026-06-11', match_time: '21:00' },
  // Viernes 12 junio
  { id: 'G-B-1', phase: 'groups', group_name: 'B', home_team: 'CAN', away_team: 'BIH', match_date: '2026-06-12', match_time: '14:00' },
  { id: 'G-D-1', phase: 'groups', group_name: 'D', home_team: 'USA', away_team: 'PAR', match_date: '2026-06-12', match_time: '20:00' },
  // Sabado 13 junio
  { id: 'G-D-2', phase: 'groups', group_name: 'D', home_team: 'AUS', away_team: 'TUR', match_date: '2026-06-13', match_time: '23:00' },
  { id: 'G-B-2', phase: 'groups', group_name: 'B', home_team: 'QAT', away_team: 'SUI', match_date: '2026-06-13', match_time: '14:00' },
  { id: 'G-C-1', phase: 'groups', group_name: 'C', home_team: 'BRA', away_team: 'MAR', match_date: '2026-06-13', match_time: '17:00' },
  { id: 'G-C-2', phase: 'groups', group_name: 'C', home_team: 'HTI', away_team: 'SCO', match_date: '2026-06-13', match_time: '20:00' },
  // Domingo 14 junio
  { id: 'G-E-1', phase: 'groups', group_name: 'E', home_team: 'GER', away_team: 'CUR', match_date: '2026-06-14', match_time: '12:00' },
  { id: 'G-F-1', phase: 'groups', group_name: 'F', home_team: 'NED', away_team: 'JPN', match_date: '2026-06-14', match_time: '15:00' },
  { id: 'G-E-2', phase: 'groups', group_name: 'E', home_team: 'CIV', away_team: 'ECU', match_date: '2026-06-14', match_time: '18:00' },
  { id: 'G-F-2', phase: 'groups', group_name: 'F', home_team: 'SWE', away_team: 'TUN', match_date: '2026-06-14', match_time: '21:00' },
  // Lunes 15 junio
  { id: 'G-H-1', phase: 'groups', group_name: 'H', home_team: 'ESP', away_team: 'CPV', match_date: '2026-06-15', match_time: '11:00' },
  { id: 'G-G-1', phase: 'groups', group_name: 'G', home_team: 'BEL', away_team: 'EGY', match_date: '2026-06-15', match_time: '14:00' },
  { id: 'G-H-2', phase: 'groups', group_name: 'H', home_team: 'KSA', away_team: 'URU', match_date: '2026-06-15', match_time: '17:00' },
  { id: 'G-G-2', phase: 'groups', group_name: 'G', home_team: 'IRN', away_team: 'NZL', match_date: '2026-06-15', match_time: '20:00' },
  // Martes 16 junio
  { id: 'G-I-1', phase: 'groups', group_name: 'I', home_team: 'FRA', away_team: 'SEN', match_date: '2026-06-16', match_time: '14:00' },
  { id: 'G-I-2', phase: 'groups', group_name: 'I', home_team: 'IRQ', away_team: 'NOR', match_date: '2026-06-16', match_time: '17:00' },
  { id: 'G-J-1', phase: 'groups', group_name: 'J', home_team: 'ARG', away_team: 'ALG', match_date: '2026-06-16', match_time: '20:00' },
  { id: 'G-J-2', phase: 'groups', group_name: 'J', home_team: 'AUT', away_team: 'JOR', match_date: '2026-06-16', match_time: '23:00' },
  // Miercoles 17 junio
  { id: 'G-K-1', phase: 'groups', group_name: 'K', home_team: 'POR', away_team: 'DRC', match_date: '2026-06-17', match_time: '12:00' },
  { id: 'G-L-1', phase: 'groups', group_name: 'L', home_team: 'ENG', away_team: 'CRO', match_date: '2026-06-17', match_time: '15:00' },
  { id: 'G-L-2', phase: 'groups', group_name: 'L', home_team: 'GHA', away_team: 'PAN', match_date: '2026-06-17', match_time: '18:00' },
  { id: 'G-K-2', phase: 'groups', group_name: 'K', home_team: 'UZB', away_team: 'COL', match_date: '2026-06-17', match_time: '21:00' },
  // Jueves 18 junio
  { id: 'G-A-3', phase: 'groups', group_name: 'A', home_team: 'CZE', away_team: 'RSA', match_date: '2026-06-18', match_time: '11:00' },
  { id: 'G-B-3', phase: 'groups', group_name: 'B', home_team: 'SUI', away_team: 'BIH', match_date: '2026-06-18', match_time: '14:00' },
  { id: 'G-B-4', phase: 'groups', group_name: 'B', home_team: 'CAN', away_team: 'QAT', match_date: '2026-06-18', match_time: '17:00' },
  { id: 'G-A-4', phase: 'groups', group_name: 'A', home_team: 'MEX', away_team: 'KOR', match_date: '2026-06-18', match_time: '20:00' },
  // Viernes 19 junio
  { id: 'G-D-3', phase: 'groups', group_name: 'D', home_team: 'TUR', away_team: 'PAR', match_date: '2026-06-19', match_time: '23:00' },
  { id: 'G-D-4', phase: 'groups', group_name: 'D', home_team: 'USA', away_team: 'AUS', match_date: '2026-06-19', match_time: '14:00' },
  { id: 'G-C-3', phase: 'groups', group_name: 'C', home_team: 'SCO', away_team: 'MAR', match_date: '2026-06-19', match_time: '17:00' },
  { id: 'G-C-4', phase: 'groups', group_name: 'C', home_team: 'BRA', away_team: 'HTI', match_date: '2026-06-19', match_time: '20:00' },
  // Sabado 20 junio
  { id: 'G-F-3', phase: 'groups', group_name: 'F', home_team: 'TUN', away_team: 'JPN', match_date: '2026-06-20', match_time: '23:00' },
  { id: 'G-F-4', phase: 'groups', group_name: 'F', home_team: 'NED', away_team: 'SWE', match_date: '2026-06-20', match_time: '12:00' },
  { id: 'G-E-3', phase: 'groups', group_name: 'E', home_team: 'GER', away_team: 'CIV', match_date: '2026-06-20', match_time: '15:00' },
  { id: 'G-E-4', phase: 'groups', group_name: 'E', home_team: 'ECU', away_team: 'CUR', match_date: '2026-06-20', match_time: '19:00' },
  // Domingo 21 junio
  { id: 'G-H-3', phase: 'groups', group_name: 'H', home_team: 'ESP', away_team: 'KSA', match_date: '2026-06-21', match_time: '11:00' },
  { id: 'G-G-3', phase: 'groups', group_name: 'G', home_team: 'BEL', away_team: 'IRN', match_date: '2026-06-21', match_time: '14:00' },
  { id: 'G-H-4', phase: 'groups', group_name: 'H', home_team: 'URU', away_team: 'CPV', match_date: '2026-06-21', match_time: '17:00' },
  { id: 'G-G-4', phase: 'groups', group_name: 'G', home_team: 'NZL', away_team: 'EGY', match_date: '2026-06-21', match_time: '20:00' },
  // Lunes 22 junio
  { id: 'G-J-3', phase: 'groups', group_name: 'J', home_team: 'ARG', away_team: 'AUT', match_date: '2026-06-22', match_time: '12:00' },
  { id: 'G-I-3', phase: 'groups', group_name: 'I', home_team: 'FRA', away_team: 'IRQ', match_date: '2026-06-22', match_time: '16:00' },
  { id: 'G-I-4', phase: 'groups', group_name: 'I', home_team: 'NOR', away_team: 'SEN', match_date: '2026-06-22', match_time: '19:00' },
  { id: 'G-J-4', phase: 'groups', group_name: 'J', home_team: 'JOR', away_team: 'ALG', match_date: '2026-06-22', match_time: '22:00' },
  // Martes 23 junio
  { id: 'G-K-3', phase: 'groups', group_name: 'K', home_team: 'POR', away_team: 'UZB', match_date: '2026-06-23', match_time: '12:00' },
  { id: 'G-L-3', phase: 'groups', group_name: 'L', home_team: 'ENG', away_team: 'GHA', match_date: '2026-06-23', match_time: '15:00' },
  { id: 'G-L-4', phase: 'groups', group_name: 'L', home_team: 'PAN', away_team: 'CRO', match_date: '2026-06-23', match_time: '18:00' },
  { id: 'G-K-4', phase: 'groups', group_name: 'K', home_team: 'COL', away_team: 'DRC', match_date: '2026-06-23', match_time: '21:00' },
  // Miercoles 24 junio - jornada final grupo B y C
  { id: 'G-B-5', phase: 'groups', group_name: 'B', home_team: 'SUI', away_team: 'CAN', match_date: '2026-06-24', match_time: '14:00' },
  { id: 'G-B-6', phase: 'groups', group_name: 'B', home_team: 'BIH', away_team: 'QAT', match_date: '2026-06-24', match_time: '14:00' },
  { id: 'G-C-5', phase: 'groups', group_name: 'C', home_team: 'SCO', away_team: 'BRA', match_date: '2026-06-24', match_time: '17:00' },
  { id: 'G-C-6', phase: 'groups', group_name: 'C', home_team: 'MAR', away_team: 'HTI', match_date: '2026-06-24', match_time: '17:00' },
  { id: 'G-A-5', phase: 'groups', group_name: 'A', home_team: 'CZE', away_team: 'MEX', match_date: '2026-06-24', match_time: '20:00' },
  { id: 'G-A-6', phase: 'groups', group_name: 'A', home_team: 'RSA', away_team: 'KOR', match_date: '2026-06-24', match_time: '20:00' },
  // Jueves 25 junio - jornada final grupos D, E, F
  { id: 'G-E-5', phase: 'groups', group_name: 'E', home_team: 'CUR', away_team: 'CIV', match_date: '2026-06-25', match_time: '15:00' },
  { id: 'G-E-6', phase: 'groups', group_name: 'E', home_team: 'ECU', away_team: 'GER', match_date: '2026-06-25', match_time: '15:00' },
  { id: 'G-F-5', phase: 'groups', group_name: 'F', home_team: 'JPN', away_team: 'SWE', match_date: '2026-06-25', match_time: '18:00' },
  { id: 'G-F-6', phase: 'groups', group_name: 'F', home_team: 'TUN', away_team: 'NED', match_date: '2026-06-25', match_time: '18:00' },
  { id: 'G-D-5', phase: 'groups', group_name: 'D', home_team: 'TUR', away_team: 'USA', match_date: '2026-06-25', match_time: '21:00' },
  { id: 'G-D-6', phase: 'groups', group_name: 'D', home_team: 'PAR', away_team: 'AUS', match_date: '2026-06-25', match_time: '21:00' },
  // Viernes 26 junio - jornada final grupos G, H, I
  { id: 'G-I-5', phase: 'groups', group_name: 'I', home_team: 'NOR', away_team: 'FRA', match_date: '2026-06-26', match_time: '14:00' },
  { id: 'G-I-6', phase: 'groups', group_name: 'I', home_team: 'SEN', away_team: 'IRQ', match_date: '2026-06-26', match_time: '14:00' },
  { id: 'G-H-5', phase: 'groups', group_name: 'H', home_team: 'CPV', away_team: 'KSA', match_date: '2026-06-26', match_time: '19:00' },
  { id: 'G-H-6', phase: 'groups', group_name: 'H', home_team: 'URU', away_team: 'ESP', match_date: '2026-06-26', match_time: '19:00' },
  { id: 'G-G-5', phase: 'groups', group_name: 'G', home_team: 'EGY', away_team: 'IRN', match_date: '2026-06-26', match_time: '22:00' },
  { id: 'G-G-6', phase: 'groups', group_name: 'G', home_team: 'NZL', away_team: 'BEL', match_date: '2026-06-26', match_time: '22:00' },
  // Sabado 27 junio - jornada final grupos J, K, L
  { id: 'G-L-5', phase: 'groups', group_name: 'L', home_team: 'PAN', away_team: 'ENG', match_date: '2026-06-27', match_time: '16:00' },
  { id: 'G-L-6', phase: 'groups', group_name: 'L', home_team: 'CRO', away_team: 'GHA', match_date: '2026-06-27', match_time: '16:00' },
  { id: 'G-K-5', phase: 'groups', group_name: 'K', home_team: 'COL', away_team: 'POR', match_date: '2026-06-27', match_time: '18:30' },
  { id: 'G-K-6', phase: 'groups', group_name: 'K', home_team: 'DRC', away_team: 'UZB', match_date: '2026-06-27', match_time: '18:30' },
  { id: 'G-J-5', phase: 'groups', group_name: 'J', home_team: 'ALG', away_team: 'AUT', match_date: '2026-06-27', match_time: '21:00' },
  { id: 'G-J-6', phase: 'groups', group_name: 'J', home_team: 'JOR', away_team: 'ARG', match_date: '2026-06-27', match_time: '21:00' }
];

const KNOCKOUT_MATCHES = [
  { id: 'R32-1', phase: 'r16', label: 'Octavos: 2A vs 2B', date: '2026-06-28', time: '14:00' },
  { id: 'R32-2', phase: 'r16', label: 'Octavos: 1C vs 2F', date: '2026-06-29', time: '12:00' },
  { id: 'R32-3', phase: 'r16', label: 'Octavos: 1E vs 3ro', date: '2026-06-29', time: '15:30' },
  { id: 'R32-4', phase: 'r16', label: 'Octavos: 1F vs 2C', date: '2026-06-29', time: '20:00' },
  { id: 'R32-5', phase: 'r16', label: 'Octavos: 1I vs 3ro', date: '2026-06-30', time: '16:00' },
  { id: 'R32-6', phase: 'r16', label: 'Octavos: 2E vs 2I', date: '2026-06-30', time: '12:00' },
  { id: 'R32-7', phase: 'r16', label: 'Octavos: 1A vs 3ro', date: '2026-06-30', time: '20:00' },
  { id: 'R32-8', phase: 'r16', label: 'Octavos: 1L vs 3ro', date: '2026-07-01', time: '11:00' },
  { id: 'R32-9', phase: 'r16', label: 'Octavos: 1G vs 3ro', date: '2026-07-01', time: '15:00' },
  { id: 'R32-10', phase: 'r16', label: 'Octavos: 1D vs 3ro', date: '2026-07-01', time: '19:00' },
  { id: 'R32-11', phase: 'r16', label: 'Octavos: 2K vs 2L', date: '2026-07-02', time: '18:00' },
  { id: 'R32-12', phase: 'r16', label: 'Octavos: 1H vs 2J', date: '2026-07-02', time: '14:00' },
  { id: 'R32-13', phase: 'r16', label: 'Octavos: 1B vs 3ro', date: '2026-07-02', time: '22:00' },
  { id: 'R32-14', phase: 'r16', label: 'Octavos: 1J vs 2H', date: '2026-07-03', time: '17:00' },
  { id: 'R32-15', phase: 'r16', label: 'Octavos: 1K vs 3ro', date: '2026-07-03', time: '20:30' },
  { id: 'R32-16', phase: 'r16', label: 'Octavos: 2D vs 2G', date: '2026-07-03', time: '13:00' },
  { id: 'QF-1', phase: 'qf', label: 'Octavos 1', date: '2026-07-04', time: '12:00' },
  { id: 'QF-2', phase: 'qf', label: 'Octavos 2', date: '2026-07-04', time: '16:00' },
  { id: 'QF-3', phase: 'qf', label: 'Octavos 3', date: '2026-07-05', time: '15:00' },
  { id: 'QF-4', phase: 'qf', label: 'Octavos 4', date: '2026-07-05', time: '19:00' },
  { id: 'QF-5', phase: 'qf', label: 'Octavos 5', date: '2026-07-06', time: '14:00' },
  { id: 'QF-6', phase: 'qf', label: 'Octavos 6', date: '2026-07-06', time: '19:00' },
  { id: 'QF-7', phase: 'qf', label: 'Octavos 7', date: '2026-07-07', time: '11:00' },
  { id: 'QF-8', phase: 'qf', label: 'Octavos 8', date: '2026-07-07', time: '15:00' },
  { id: 'SF-1', phase: 'sf', label: 'Cuartos 1', date: '2026-07-09', time: '15:00' },
  { id: 'SF-2', phase: 'sf', label: 'Cuartos 2', date: '2026-07-10', time: '14:00' },
  { id: 'SF-3', phase: 'sf', label: 'Cuartos 3', date: '2026-07-11', time: '16:00' },
  { id: 'SF-4', phase: 'sf', label: 'Cuartos 4', date: '2026-07-11', time: '20:00' },
  { id: 'SF-5', phase: 'sf', label: 'Semifinal 1', date: '2026-07-14', time: '14:00' },
  { id: 'SF-6', phase: 'sf', label: 'Semifinal 2', date: '2026-07-15', time: '14:00' },
  { id: 'TP', phase: 'tp', label: 'Tercer puesto', date: '2026-07-18', time: '16:00' },
  { id: 'FINAL', phase: 'final', label: 'Gran Final', date: '2026-07-19', time: '14:00' }
];

function generateGroupFixture() {
  return GROUP_MATCHES;
}

function getTeamByCode(code) {
  return TEAMS.find(t => t.code === code);
}

module.exports = { TEAMS, GROUPS, generateGroupFixture, KNOCKOUT_MATCHES, getTeamByCode };
