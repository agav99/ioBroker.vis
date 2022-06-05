
//********************************************************************* */
// fill vis.clones.subscribeByViews 
function  clone_prepareViewData(vis, viewInfo){

 vis.clones.subscribeByViews[viewInfo.viewID] =[]; 
 
 for (var i = 0; i < vis.subscribing.byViews[viewInfo.viewModelId].length; i++) {
    let oid=vis.subscribing.byViews[viewInfo.viewModelId][i];
    
    if (oid.indexOf('viewAttr') === 0){
        let res=replaceViewParamAttr(oid, viewInfo.params); //replace "viewAttr"
        if (res.doesMatch)
           vis.clones.subscribeByViews[viewInfo.viewID][oid]=res.newString; 
      }
 }
}

//********************************************************************* */
function clone_checkTagIDfoViewAttr(modelTagId,viewInfo) {
   let result = modelTagId;
   
   if ((modelTagId.indexOf('viewAttr') >= 0)&&
       (vis.clones.subscribeByViews[viewInfo.viewID])) 
        result=vis.clones.subscribeByViews[viewInfo.viewID][modelTagId]; 
   return result;    
}

//********************************************************************* */
function clone_updateWidgetAttributes(widgetModel, viewInfo, wid){
   
   //check all widgetModel string attributes and replace "groupAttr","viewAttr" for correct tagName
   $.map(widgetModel.data, function (val, key) {
      if (typeof val === 'string') {
          
          //Actual for all '*oid*' attributes. For  binding {} attributes it does not affect 
          if (val.indexOf('viewAttr') >= 0){
              var result = replaceViewParamAttr(val, viewInfo.params);
              if (result.doesMatch)
                widgetModel.data[key] = result.newString;
              };
            }
   });
 }

//*********************************************************************/
// widgetModel - copy of Widget model (.data .style ....)
// modelwid - model widget ID
// wid - instance widget ID = (modelwid + viewInfo.exName)
// viewInfo - viewURI object 
function clone_appentWidgetAnimateInfo(vis, modelwid, wid, viewInfo, widgetCloneModel){
        
      let ActualTagID;
      
      //Clone visibility info from "visibility" to "visibilityClone" changing id to actual
      for (var modelTagId in vis.visibility){
         if (!vis.visibility.hasOwnProperty(modelTagId))
            continue;
      
         for (let i=0; i < vis.visibility[modelTagId].length; i++) {
            if (vis.visibility[modelTagId][i].widget == modelwid){
             
            ActualTagID=clone_checkTagIDfoViewAttr(modelTagId, viewInfo);
            if (!ActualTagID) continue;

            if (!vis.clones.visibility[ActualTagID]) vis.clones.visibility[ActualTagID] = [];
            vis.clones.visibility[ActualTagID].push({ view: viewInfo.viewURI,
                                                      widget: wid
                                                    });
            break;
         }}
      }

     //Clone Signals ....
     for (var modelTagId in vis.signals){
         if (!vis.signals.hasOwnProperty(modelTagId))
           continue;
  
         for (let i=0; i < vis.signals[modelTagId].length; i++) {
           if (vis.signals[modelTagId][i].widget == modelwid){
         
           ActualTagID=clone_checkTagIDfoViewAttr(modelTagId, viewInfo);
           if (!ActualTagID) continue;

           if (!vis.clones.signals[ActualTagID]) vis.clones.signals[ActualTagID] = [];
           vis.clones.signals[ActualTagID].push({
                                                view:   viewInfo.viewURI,
                                                widget: wid,
                                                index:  vis.signals[modelTagId][i].index
                                               });
         }}
      }
      
     //Clone lastChanges Signals ....
     for (var modelTagId in vis.lastChanges){
         if (!vis.lastChanges.hasOwnProperty(modelTagId))
            continue;
  
         for (let i=0; i < vis.lastChanges[modelTagId].length; i++) {
            if (vis.lastChanges[modelTagId][i].widget == modelwid){
         
            ActualTagID=clone_checkTagIDfoViewAttr(modelTagId, viewInfo);
            if (!ActualTagID) continue;

            if (!vis.clones.lastChanges[ActualTagID]) vis.clones.lastChanges[ActualTagID] = [];
            vis.clones.lastChanges[ActualTagID].push({
                                                     view:   viewInfo.viewURI,
                                                     widget: wid
                                                     });
           }}
      }

      //Clone bindings
      for (var modelTagId in vis.bindings){
         if (!vis.bindings.hasOwnProperty(modelTagId))
            continue;
          
          for (let i=0; i < vis.bindings[modelTagId].length; i++) {
             let model_oid = vis.bindings[modelTagId][i];
             if (model_oid.widget == modelwid){
              
               //make copy of binding model data 
               let oid = JSON.parse(JSON.stringify(model_oid));
              
               //update some properties for current clone widget instance    
              oid.systemOid = clone_checkTagIDfoViewAttr(modelTagId, viewInfo);
              let res = replaceViewParamAttr(oid.format, viewInfo.params); 
              if (res.doesMatch) oid.format =res.newString; 
              oid.widget=wid;
              oid.view=viewInfo.viewURI;
              oid.modelWidgetID = modelwid;                //ext. prop  
              oid.modelViewID = viewInfo.viewModelId;    //ext. prop  

              //oid.type - 'data','style'
              //oid.attr - 'html','left'...
              //oid.visOid -   varA.val       //dosn't  matter for update
              //oid.token -   {varA}          //dosn't  matter for update
              //oid.isSeconds - bool
              
              if (oid.operations && oid.operations[0].arg instanceof Array) {
                  for (var ww = 0; ww <  oid.operations[0].arg.length; ww++) {
                      ActualTagID=clone_checkTagIDfoViewAttr(oid.operations[0].arg[ww].systemOid, viewInfo);
                      if (ActualTagID) {
                          oid.operations[0].arg[ww].systemOid=ActualTagID;

                          if (ActualTagID !==oid.systemOid){
                              if (!vis.clones.bindings[ActualTagID]) vis.clones.bindings[ActualTagID] = [];
                              vis.clones.bindings[ActualTagID].push(oid);
                          }
                      }
                  }
              }
              
              if (!vis.clones.bindings[oid.systemOid]) vis.clones.bindings[oid.systemOid] = [];
              vis.clones.bindings[oid.systemOid].push(oid);

              if (widgetCloneModel){
               var value = vis.formatBinding(oid.format, oid.view, oid.widget, widgetCloneModel);
               widgetCloneModel[oid.type][oid.attr] = value;
              }
            }
          }
      }
  }

    /**********************************************************************************/
    //For widget "wid" clear  arrays: visibilityClone,signalsClone,lastChangesClone
    //This array actual only for clone Widget
    function clone_clearWidgetAnimateInfo(vis, wid){
        
      //visibilityClone
      for (var tagid in vis.clones.visibility){
          if (!vis.clones.visibility.hasOwnProperty(tagid))
              continue;
              
          for (let i=0; i < vis.clones.visibility[tagid].length; i++) {
              if (vis.clones.visibility[tagid][i].widget == wid){
               vis.clones.visibility[tagid].splice(i,1);
                  
                  if (vis.clones.visibility[tagid].length==0)
                      delete vis.clones.visibility.tagid;
                  break;
              }
          }
      };

      let needDeleted=[];
      
      {//signalsClone region
         for (var tagid in vis.clones.signals){
            if (!vis.clones.signals.hasOwnProperty(tagid))
               continue;
               
            for (let i=0; i < vis.clones.signals[tagid].length; i++) {
               if (vis.clones.signals[tagid][i].widget == wid){
                  vis.clones.signals[tagid].splice(i,1);
                     if (vis.clones.signals[tagid].length==0) 
                        needDeleted.push(tagid);
               }
            }
         }
         for (let i=0; i < needDeleted.length; i++) 
            delete vis.clones.signals[needDeleted[i]];
      } 
      
      {//lastChangesClone
         needDeleted=[];
         for (var tagid in vis.clones.lastChanges){
            if (!vis.clones.lastChanges.hasOwnProperty(tagid))
               continue;
               
            for (let i=0; i < vis.clones.lastChanges[tagid].length; i++) {
               if (vis.clones.lastChanges[tagid][i].widget == wid){
                     vis.clones.lastChanges[tagid].splice(i,1);
                     if (vis.clones.lastChanges[tagid].length==0) 
                        needDeleted.push(tagid);
               }
            }
         }
         for (let i=0; i < needDeleted.length; i++) 
            delete vis.clones.lastChanges[needDeleted[i]]; 
      }    

      {//BindingClone
         needDeleted=[];
         for (var tagid in vis.clones.bindings){
            if (!vis.clones.bindings.hasOwnProperty(tagid))
               continue;
               
            for (let i=0; i < vis.clones.bindings[tagid].length; i++) {
               if (vis.clones.bindings[tagid][i].widget == wid){
                  vis.clones.bindings[tagid].splice(i,1);
                     if (vis.clones.bindings[tagid].length==0) 
                     needDeleted.push(tagid);
               }
            }
         }
         for (let i=0; i < needDeleted.length; i++) 
            delete vis.clones.bindings[needDeleted[i]]; 
      }
  }

