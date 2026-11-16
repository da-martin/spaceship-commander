/* Estado de la vista que se cambia desde varios módulos (pestañas, filtros,
 * plegados, confirmaciones). No se guarda en la partida.
 * Va en un objeto porque un módulo no puede reasignar una variable que importa. */
export const view = {
  // Los «Completados» plegados de Hoy, Tareas y Hábitos.
  todayDoneOpen: false,
  tasksDoneOpen: false,
  habitsDoneOpen: false,
  // En el móvil Commander se parte en tres pestañas; en sm+ esto no se mira.
  cmdTab: 'today',
  // Proyectos: filtro activo (null | 'none' | id), fila en edición ('new' | id) y borrado pendiente.
  pFilter: null,
  projEdit: null,
  projDel: null,
  // Las 13 semanas a pantalla completa (móvil); en escritorio es un panel.
  weeksScreen: false,
  // Calendarios: hay una descarga en marcha; id del que pide confirmación para quitarlo.
  calBusy: false,
  calRemoving: null,
};
