// scene_model.js - expose the shared scene geometry/anchor model.
(function(){
  if(typeof window.createSceneModel !== 'function'){
    throw new Error('scene_model.js must be loaded after scene_render.js');
  }
  window.sceneModel = window.createSceneModel();
})();
