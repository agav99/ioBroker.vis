/*  Example for pageURI: "PageA?Param1;Param2;"

    viewInfo.viewModelId: resViewName,          //= "PageA"
             params  : resViewParams,           //array = [Param1;Param2]
             exName  : resExName,               //used to create unique DivID for Clones of View  = "_Param1"  (not contain forbidden chars)
             viewURI : viewURI,                 //= "PageA?Param1;Param2;"
             isClone : resExName.length>0,      //= true if URI has extra params
             viewID  : resViewName + resExName  //= "PageA_Param1"
*/


/***************************************************************/
// Try to find substring "viewAttr№" in 'inputStr' and replace it with item from  'viewParamsList' array 
function replaceViewParamAttr(inputStr, viewParamsList) {
   var newString = inputStr;
   var match = false;

   var ms = inputStr.match(/viewAttr(\d+)/g);
   if (ms) {
       ms.forEach(function (m,i) {
           let n=Number(m.substring(8));
           if (n < viewParamsList.length){
               newString = newString.replace(/viewAttr(\d+)/, viewParamsList[n]);
               match = true;
           }
       });
       if (match) console.log('     Replaced ' + inputStr + ' with ' + newString + ' (based on ' + ms + ')');
   }
   return {doesMatch: match, newString: newString};
}

//**********************************************************************/
//Check 'inputStr' for "ViewAttr" substrings  and return converted one (return realTagID)   
function checkForViewAttr(inputStr, viewInfo, RemovePagePrefix=false) {


   if (inputStr.indexOf('viewAttr') >= 0){
      
      //for visibility/signals/lastChanges/bindings configurations modelTagId containt "PageName_" at the beginniing 
      if (RemovePagePrefix)
         inputStr = inputStr.substring(viewInfo.viewModelId.length + 1);

      inputStr = replaceViewParamAttr(inputStr, viewInfo.params).newString; //replace "viewAttr"
    }

    return inputStr;
}

//*********************************************************************/
// fill:  vis.clones.visibility[RealTagID]
//        vis.clones.signals[RealTagID]
//        vis.clones.lastChanges[RealTagID]
//        vis.clones.bindings[]
//
// modelwid - model widget ID (w00002)
// wid - instance widget ID = (modelwid + viewInfo.exName) (w00002_js0VirtualTempSensor1)
// viewInfo - viewURI object 
//
//INPORTANT: not for EditMode (vis.subscribing.byViews is empty)
function clone_appendWidgetAnimateInfo(vis, modelwid, wid, viewInfo){
        
      let ActualTagID;

      //Clone visibility info from "visibility" model (changing id to actual if TagID contain 
      for (var modelTagId in vis.visibility){
        
         if (!vis.visibility.hasOwnProperty(modelTagId)) //here modelTagId can be  PageName_ViewAttrxxxxx
            continue;
      
         for (let i=0; i < vis.visibility[modelTagId].length; i++) {
            if (vis.visibility[modelTagId][i].widget == modelwid){

               ActualTagID=checkForViewAttr(modelTagId, viewInfo, true);
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
         
               ActualTagID=checkForViewAttr(modelTagId, viewInfo, true);
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
         
               ActualTagID=checkForViewAttr(modelTagId, viewInfo,true);
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

              //if contain  "ViewAttr" replace it to get real tagId
              oid.systemOid = checkForViewAttr(modelTagId, viewInfo, true); 
              if (!oid.systemOid)
                  continue;

              let res = replaceViewParamAttr(oid.format, viewInfo.params); 
              if (res.doesMatch) oid.format =res.newString; 
              oid.widget=wid;                              //w000001  or  w000001_clone1
              oid.view=viewInfo.viewURI;
              //oid.modelWidgetID = modelwid;              //ext. prop  
              //oid.modelViewID = viewInfo.viewModelId;    //ext. prop  

              //oid.type - 'data','style'
              //oid.attr - 'html','left'...
              //oid.visOid -   varA.val       //dosn't  matter for update
              //oid.token -   {varA}          //dosn't  matter for update
              //oid.isSeconds - bool
              
              if (oid.operations && oid.operations[0].arg instanceof Array) {
                  for (var ww = 0; ww <  oid.operations[0].arg.length; ww++) {
                      ActualTagID=checkForViewAttr(oid.operations[0].arg[ww].systemOid, viewInfo);
                      if (ActualTagID) {
                          oid.operations[0].arg[ww].systemOid=ActualTagID;

                          if (ActualTagID !==oid.systemOid){
                              if (!vis.clones.bindingsByTag[ActualTagID]) vis.clones.bindingsByTag[ActualTagID] = [];
                              vis.clones.bindingsByTag[ActualTagID].push(oid);
                          }
                      }
                  }
              }
              //oid.systemOid is realTagID
              if (!vis.clones.bindingsByTag[oid.systemOid]) vis.clones.bindingsByTag[oid.systemOid] = [];
              vis.clones.bindingsByTag[oid.systemOid].push(oid);

              if (!vis.clones.bindingsByWidget[wid]) vis.clones.bindingsByWidget[wid] = [];
              vis.clones.bindingsByWidget[wid].push(oid);
            }
          }
      }
  }

  /**********************************************************************************/
  // Recalc all binging attributes in clonedWidgetModel 
  // (when rendering widget clone first time )
  // wid - instance widget ID = (modelwid + viewInfo.exName) (w00002_js0VirtualTempSensor1)
  function clone_UpdateBindingAttrinbutesForWidget(vis, wid, viewInfo, clonedWidgetModel){
   
   //check viewAttr
   $.map(clonedWidgetModel.data, function (val, key) {
         if (typeof val === 'string') {
            clonedWidgetModel.data[key] = checkForViewAttr(val, viewInfo);
         }
   });

   //check bindings   
   if (!vis.clones.bindingsByWidget.hasOwnProperty(wid))
      return;   
   
   for (let i=0; i < vis.clones.bindingsByWidget[wid].length; i++) {
         let model_oid = vis.clones.bindingsByWidget[wid][i];

         if (clonedWidgetModel){
               var value = vis.formatBinding(model_oid.format, model_oid.view, model_oid.widget, clonedWidgetModel);
               clonedWidgetModel[model_oid.type][model_oid.attr] = value;
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
         for (var tagid in vis.clones.bindingsByTag){
            if (!vis.clones.bindingsByTag.hasOwnProperty(tagid))
               continue;
               
            for (let i=0; i < vis.clones.bindingsByTag[tagid].length; i++) {
               if (vis.clones.bindingsByTag[tagid][i].widget == wid){
                 
                  vis.clones.bindingsByTag[tagid].splice(i,1);
                  if (vis.clones.bindingsByTag[tagid].length==0) 
                     needDeleted.push(tagid);
               }
            }
         }
         for (let i=0; i < needDeleted.length; i++) 
            delete vis.clones.bindingsByTag[needDeleted[i]]; 

         delete vis.clones.bindingsByWidget[wid]; 
      }
  }


  /**********************************************************************************/

