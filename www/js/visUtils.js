/**
 *  ioBroker.vis
 *  https://github.com/ioBroker/ioBroker.vis
 *
 *  Copyright (c) 2013-2022 bluefox https://github.com/GermanBluefox,
 *  Copyright (c) 2013-2014 hobbyquaker https://github.com/hobbyquaker
 *  Creative Common Attribution-NonCommercial (CC BY-NC)
 *
 *  http://creativecommons.org/licenses/by-nc/4.0/
 *
 * Short content:
 * Licensees may copy, distribute, display and perform the work and make derivative works based on it only if they give the author or licensor the credits in the manner specified by these.
 * Licensees may copy, distribute, display, and perform the work and make derivative works based on it only for noncommercial purposes.
 * (Free for non-commercial use).
 */

/************************************************************** */
// NOT used now
function getAttributSufix(attrValue){
    return "";
    
    if (!attrValue) return "";
    
    let p = attrValue.indexOf('|');
    if (p>0)
        return attrValue.substring(p);

    return ""
}
function getAttributPrefix(attrValue){
    return "";
    if (!attrValue) return "";
    let p = attrValue.indexOf('|');
    if (p>0)
        return attrValue.substring(0, p);
    return attrValue
}


/************************************************************** */
//Parse viewURI  format: viewModelId?Param1;Param2;...   оr only:  viewModelId
//Вернет класс с разобранными полями  viewURI
function parseViewURI (viewURI){
  let resViewName=viewURI;
  let resViewParams=[];     
  let resExName='';
  
  if (viewURI && (viewURI.indexOf('?')>0))
   { let viewQ=viewURI.split('?');
     resViewName=viewQ[0];
     resViewParams=viewQ[1].split(';')
     
     if (resViewParams?.length>0)
         resExName = resViewParams[0];

     resExName = resExName.replace("?","_").replace(/\./g,"").replace(/;/g,"").replace(/javascript/g,"js");
     if (resExName.length>0) resExName='_'+resExName;
   }
                                             //Example for: "PageA?Param1;Param2;"
  return {viewURI : viewURI,                 //= "PageA?Param1;Param2;" (исходное значение)
          viewModelId: resViewName,          //= "PageA"
          params  : resViewParams,           //array = [Param1;Param2]
          exName  : resExName,               //used to create unique DivID for Clons of View  = "_Param1"  (not contain forbidden chars)
          isClone : resExName.length>0,      //= true if URI has extra params
          viewID  : resViewName + resExName  //= "PageA_Param1Param2" (Это DivId)
         }
 }

/************************************************************** */
//PRIVATE
function replaceGroupAttr(inputStr, groupAttrList) {
    var newString = inputStr;
    var match = false;
    var ms = inputStr.match(/(groupAttr\d+)+?/g); //get array, allmatching
    if (ms) {
        ms.forEach(function (m) {
            if (m in groupAttrList){
              newString = newString.replace(/groupAttr(\d+)/, groupAttrList[m]);
              match = true;
            }
        });
        if (match) console.debug('     Replaced ' + inputStr + ' with ' + newString + ' (based on ' + ms + ')');
    }
    return {doesMatch: match, newString: newString};
}

/************************************************************** */
// replace  "groupAttr" substring of  attribute value 'inputStr'  for child Widget of group  'groupId' 
//PRIVATE
function checkForGroupAttr(vis, inputStr, groupId, viewModelId){
    var resStr = inputStr;
    if (groupId){
        var aCount = parseInt(vis.views[viewModelId].widgets[groupId].data.attrCount, 10);
        if (aCount) {
            resStr = replaceGroupAttr(resStr, vis.views[viewModelId].widgets[groupId].data).newString;
        }
    }   
    return resStr;
}


/************************************************************** */
//Try find parent groupobj for widget (using project models info vis.viws[].windgets[]) 
function getWidgetGroup(views, view, widget) {
    var widgets = views[view].widgets;
    var groupID = widgets[widget].groupid;
    if (groupID) {
        return groupID;
    }

    for (var w in widgets) {
        if (!widgets.hasOwnProperty(w) || !widgets[w].data) {
            continue;
        }
        var members = widgets[w].data.members;
        if (members && members.indexOf(widget) !== -1) {
            return w;
        }
    }

    return null;
}

/***************************************************************/
// get valuе of Obj property PropPath. PropPath is string like "Prop1" or "Prop1.Prop2" ...
//Used for calculation "json" binding instruction
function getObjPropValue(obj, propPath) {
    if (!obj) {
        return undefined;
    }
    const parts = propPath.split('.');
    for (const part of parts) {
        obj = obj[part];
        if (!obj) {
            return undefined;
        }
    }
    return obj;
}



//Format: {objectID1;operation1;operation2;...} ..{ }.. { }
//examples:
//  {objectRed.lc; date(hh:mm)} .. {h:height; w:width; Math.max(20, Math.sqrt(h*h + w*w))} ...
//  "color={objectRed;/(100);*(255);HEX2}"
//
//Return array of object
//   {visOid     - 'objectRed.val' 
//    systemOid  - 'objectRed'
//    token      - '{objectRed;/(100);*(255);HEX2}'
//    operations[] - {op, arg[], formula}...
//    format     - 'color={objectRed;/(100);*(255);HEX2}'
//    isSeconds  - false
//later next fields are added:  
//    type - 'date'|'style'  
//    attr - 
//    view - 
//    widget - 
//  }
function extractBinding(format) {
    var oid = format.match(/{(.+?)}/g);
    var result = null;
    if (oid) {
        if (oid.length > 50) {
            console.warn('Too many bindings in one widget: ' + oid.length + '[max = 50]');
        }
        for (var p = 0; p < oid.length && p < 50; p++) {
            //Parsing one binding instruction {__;__;__;__;__}
            var _oid = oid[p].substring(1, oid[p].length - 1);
            if (_oid[0] === '{') {
                continue;
            }
            // If first symbol '"' => it is JSON
            if (_oid && _oid[0] === '"') {
                continue;
            }
            var parts = _oid.split(';');
            result = result || [];
            var systemOid = parts[0].trim();
            var visOid = systemOid;

            var test1 = visOid.substring(visOid.length - 4);
            var test2 = visOid.substring(visOid.length - 3);

            if (visOid && test1 !== '.val' && test2 !== '.ts' && test2 !== '.lc' && test1 !== '.ack') {
                visOid = visOid + '.val';
            }

            var isSeconds = (test2 === '.ts' || test2 === '.lc');

            test1 = systemOid.substring(systemOid.length - 4);
            test2 = systemOid.substring(systemOid.length - 3);

            if (test1 === '.val' || test1 === '.ack') {
                systemOid = systemOid.substring(0, systemOid.length - 4);
            } else if (test2 === '.lc' || test2 === '.ts') {
                systemOid = systemOid.substring(0, systemOid.length - 3);
            }
            var operations = null;

            //check for: {h:height;w:width;Math.max(20, Math.sqrt(h*h + w*w))}
            var isEval = visOid.match(/^[\d\w_]+:\s?[-\d\w_.]+/) || (!visOid.length && parts.length > 0); //(visOid.indexOf(':') !== -1) && (visOid.indexOf('::') === -1);

            if (isEval) {
                var xx = visOid.split(':', 2);
                var yy = systemOid.split(':', 2);
                visOid = xx[1];
                systemOid = yy[1];
                operations = operations || [];
                operations.push({
                    op: 'eval',
                    arg: [{
                        name: xx[0],
                        visOid: visOid,
                        systemOid: systemOid
                    }]
                });
            }

            //обработка части инструкции  между ___;___;____    
            for (var u = 1; u < parts.length; u++) {
                // eval construction
                if (isEval) {
                    //match(/^[\d\w_]+:\s?[-.\d\w_]+$/))   //v1.4.15
                    //match(/^[\d\w_]+:\s?[-.\d\w_]+$/))   //v my 
                    //match(/^[\d\w_]+:\s?[._\-\/ :!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]+$/u)) //2023_11_19
                    //match(/^[\d\w_]+:\s?[-._/ :!#$%&()+=@^{}|~\p{Ll}\p{Lu}\p{Nd}]+$/u))   //2023_11_29
                    //match(/^[0-9A-Z_a-z]+:[\t-\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]?(?:[ !#-&\(\)\+\x2D-:=@-Z\^_a-~\xB5\xC0-\xD6\xD8-\xF6\xF8-\u01BA\u01BC-\u01BF\u01C4\u01C6\u01C7\u01C9\u01CA\u01CC-\u01F1\u01F3-\u0293\u0295-\u02AF\u0370-\u0373\u0376\u0377\u037B-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0560-\u0588\u0660-\u0669\u06F0-\u06F9\u07C0-\u07C9\u0966-\u096F\u09E6-\u09EF\u0A66-\u0A6F\u0AE6-\u0AEF\u0B66-\u0B6F\u0BE6-\u0BEF\u0C66-\u0C6F\u0CE6-\u0CEF\u0D66-\u0D6F\u0DE6-\u0DEF\u0E50-\u0E59\u0ED0-\u0ED9\u0F20-\u0F29\u1040-\u1049\u1090-\u1099\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FD-\u10FF\u13A0-\u13F5\u13F8-\u13FD\u17E0-\u17E9\u1810-\u1819\u1946-\u194F\u19D0-\u19D9\u1A80-\u1A89\u1A90-\u1A99\u1B50-\u1B59\u1BB0-\u1BB9\u1C40-\u1C49\u1C50-\u1C59\u1C80-\u1C88\u1C90-\u1CBA\u1CBD-\u1CBF\u1D00-\u1D2B\u1D6B-\u1D77\u1D79-\u1D9A\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1F87\u1F90-\u1F97\u1FA0-\u1FA7\u1FB0-\u1FB4\u1FB6-\u1FBB\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCB\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFB\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2134\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2C7B\u2C7E-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\uA620-\uA629\uA640-\uA66D\uA680-\uA69B\uA722-\uA76F\uA771-\uA787\uA78B-\uA78E\uA790-\uA7CA\uA7D0\uA7D1\uA7D3\uA7D5-\uA7D9\uA7F5\uA7F6\uA7FA\uA8D0-\uA8D9\uA900-\uA909\uA9D0-\uA9D9\uA9F0-\uA9F9\uAA50-\uAA59\uAB30-\uAB5A\uAB60-\uAB68\uAB70-\uABBF\uABF0-\uABF9\uFB00-\uFB06\uFB13-\uFB17\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]|\uD801[\uDC00-\uDC4F\uDCA0-\uDCA9\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD70-\uDD7A\uDD7C-\uDD8A\uDD8C-\uDD92\uDD94\uDD95\uDD97-\uDDA1\uDDA3-\uDDB1\uDDB3-\uDDB9\uDDBB\uDDBC]|\uD803[\uDC80-\uDCB2\uDCC0-\uDCF2\uDD30-\uDD39]|\uD804[\uDC66-\uDC6F\uDCF0-\uDCF9\uDD36-\uDD3F\uDDD0-\uDDD9\uDEF0-\uDEF9]|\uD805[\uDC50-\uDC59\uDCD0-\uDCD9\uDE50-\uDE59\uDEC0-\uDEC9\uDF30-\uDF39]|\uD806[\uDCA0-\uDCE9\uDD50-\uDD59]|\uD807[\uDC50-\uDC59\uDD50-\uDD59\uDDA0-\uDDA9\uDF50-\uDF59]|\uD81A[\uDE60-\uDE69\uDEC0-\uDEC9\uDF50-\uDF59]|\uD81B[\uDE40-\uDE7F]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD837[\uDF00-\uDF09\uDF0B-\uDF1E\uDF25-\uDF2A]|\uD838[\uDD40-\uDD49\uDEF0-\uDEF9]|\uD839[\uDCF0-\uDCF9]|\uD83A[\uDD00-\uDD43\uDD50-\uDD59]|\uD83E[\uDFF0-\uDFF9])+$/))  //2024_07_13

                    if (parts[u].trim().match(/^[0-9A-Z_a-z]+:[\t-\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]?(?:[ !#-&\(\)\+\x2D-:=@-Z\^_a-~\xB5\xC0-\xD6\xD8-\xF6\xF8-\u01BA\u01BC-\u01BF\u01C4\u01C6\u01C7\u01C9\u01CA\u01CC-\u01F1\u01F3-\u0293\u0295-\u02AF\u0370-\u0373\u0376\u0377\u037B-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0560-\u0588\u0660-\u0669\u06F0-\u06F9\u07C0-\u07C9\u0966-\u096F\u09E6-\u09EF\u0A66-\u0A6F\u0AE6-\u0AEF\u0B66-\u0B6F\u0BE6-\u0BEF\u0C66-\u0C6F\u0CE6-\u0CEF\u0D66-\u0D6F\u0DE6-\u0DEF\u0E50-\u0E59\u0ED0-\u0ED9\u0F20-\u0F29\u1040-\u1049\u1090-\u1099\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FD-\u10FF\u13A0-\u13F5\u13F8-\u13FD\u17E0-\u17E9\u1810-\u1819\u1946-\u194F\u19D0-\u19D9\u1A80-\u1A89\u1A90-\u1A99\u1B50-\u1B59\u1BB0-\u1BB9\u1C40-\u1C49\u1C50-\u1C59\u1C80-\u1C88\u1C90-\u1CBA\u1CBD-\u1CBF\u1D00-\u1D2B\u1D6B-\u1D77\u1D79-\u1D9A\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1F87\u1F90-\u1F97\u1FA0-\u1FA7\u1FB0-\u1FB4\u1FB6-\u1FBB\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCB\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFB\u2102\u2107\u210A-\u2113\u2115\u2119-\u211D\u2124\u2126\u2128\u212A-\u212D\u212F-\u2134\u2139\u213C-\u213F\u2145-\u2149\u214E\u2183\u2184\u2C00-\u2C7B\u2C7E-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\uA620-\uA629\uA640-\uA66D\uA680-\uA69B\uA722-\uA76F\uA771-\uA787\uA78B-\uA78E\uA790-\uA7CA\uA7D0\uA7D1\uA7D3\uA7D5-\uA7D9\uA7F5\uA7F6\uA7FA\uA8D0-\uA8D9\uA900-\uA909\uA9D0-\uA9D9\uA9F0-\uA9F9\uAA50-\uAA59\uAB30-\uAB5A\uAB60-\uAB68\uAB70-\uABBF\uABF0-\uABF9\uFB00-\uFB06\uFB13-\uFB17\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]|\uD801[\uDC00-\uDC4F\uDCA0-\uDCA9\uDCB0-\uDCD3\uDCD8-\uDCFB\uDD70-\uDD7A\uDD7C-\uDD8A\uDD8C-\uDD92\uDD94\uDD95\uDD97-\uDDA1\uDDA3-\uDDB1\uDDB3-\uDDB9\uDDBB\uDDBC]|\uD803[\uDC80-\uDCB2\uDCC0-\uDCF2\uDD30-\uDD39]|\uD804[\uDC66-\uDC6F\uDCF0-\uDCF9\uDD36-\uDD3F\uDDD0-\uDDD9\uDEF0-\uDEF9]|\uD805[\uDC50-\uDC59\uDCD0-\uDCD9\uDE50-\uDE59\uDEC0-\uDEC9\uDF30-\uDF39]|\uD806[\uDCA0-\uDCE9\uDD50-\uDD59]|\uD807[\uDC50-\uDC59\uDD50-\uDD59\uDDA0-\uDDA9\uDF50-\uDF59]|\uD81A[\uDE60-\uDE69\uDEC0-\uDEC9\uDF50-\uDF59]|\uD81B[\uDE40-\uDE7F]|\uD835[\uDC00-\uDC54\uDC56-\uDC9C\uDC9E\uDC9F\uDCA2\uDCA5\uDCA6\uDCA9-\uDCAC\uDCAE-\uDCB9\uDCBB\uDCBD-\uDCC3\uDCC5-\uDD05\uDD07-\uDD0A\uDD0D-\uDD14\uDD16-\uDD1C\uDD1E-\uDD39\uDD3B-\uDD3E\uDD40-\uDD44\uDD46\uDD4A-\uDD50\uDD52-\uDEA5\uDEA8-\uDEC0\uDEC2-\uDEDA\uDEDC-\uDEFA\uDEFC-\uDF14\uDF16-\uDF34\uDF36-\uDF4E\uDF50-\uDF6E\uDF70-\uDF88\uDF8A-\uDFA8\uDFAA-\uDFC2\uDFC4-\uDFCB\uDFCE-\uDFFF]|\uD837[\uDF00-\uDF09\uDF0B-\uDF1E\uDF25-\uDF2A]|\uD838[\uDD40-\uDD49\uDEF0-\uDEF9]|\uD839[\uDCF0-\uDCF9]|\uD83A[\uDD00-\uDD43\uDD50-\uDD59]|\uD83E[\uDFF0-\uDFF9])+$/)) {  

                        var _systemOid = parts[u].trim();
                        var _visOid = _systemOid;

                        test1 = _visOid.substring(_visOid.length - 4);
                        test2 = _visOid.substring(_visOid.length - 3);

                        if (test1 !== '.val' && test2 !== '.ts' && test2 !== '.lc' && test1 !== '.ack') {
                            _visOid = _visOid + '.val';
                        }

                        test1 = systemOid.substring(_systemOid.length - 4);
                        test2 = systemOid.substring(_systemOid.length - 3);

                        if (test1 === '.val' || test1 === '.ack') {
                            _systemOid = _systemOid.substring(0, _systemOid.length - 4);
                        } else if (test2 === '.lc' || test2 === '.ts') {
                            _systemOid = _systemOid.substring(0, _systemOid.length - 3);
                        }
                        var x1 = _visOid.split(':', 2);
                        var y1 = _systemOid.split(':', 2);

                        operations[0].arg.push({
                            name:      x1[0],
                            visOid:    x1[1],
                            systemOid: y1[1]
                        });
                    } else {
                        parts[u] = parts[u].replace(/::/g, ':');
                        if (operations[0].formula) {
                            var n = JSON.parse(JSON.stringify(operations[0]));
                            n.formula = parts[u];
                            operations.push(n);
                        } else {
                            operations[0].formula = parts[u];
                        }
                    }
                } else {

                    //преобразование value в float. иначе null
                    function checkValueNumber(value){
                        if (value === undefined) {
                            return null
                        } 
                        else {
                            value = (value || '').trim().replace(',', '.');
                            
                            if (value.indexOf('(')==0)  
                                value = value.substring(1, value.length - 1);

                            value = parseFloat(value.trim());

                            if (value.toString() === 'NaN') {
                                return null;
                            } else {
                                return value;
                            }
                        }
                    }


                    var parse = parts[u].match(/([\w\s\/+*-=<>!]+)(\(.+\))?/);  //Examples:  *(256); HEX2; date(hh:mm); array(value1,value2) 
                    if (parse && parse[1]) {
                        parse[1] = parse[1].trim();  //то, что до    (___)
                       
                        // operators requires parameter
                        if (parse[1] === '*' ||
                            parse[1] === '+' ||
                            parse[1] === '-' ||
                            parse[1] === '/' ||
                            parse[1] === '%' ||
                            parse[1] === 'min' ||
                            parse[1] === 'max' 
                            ) {
                                parse[2] = checkValueNumber(parse[2]); 

                                if (parse[2] === null) {
                                    console.log('Invalid format of format string: ' + format);
                                } 
                                else {
                                        operations = operations || [];
                                        operations.push({op: parse[1], arg: parse[2]});
                                    }
                            
                        } else
                        // date formatting
                        if (parse[1] === 'date' || parse[1] === 'momentDate' ) {
                            operations = operations || [];
                            parse[2] = (parse[2] || '').trim();
                            parse[2] = parse[2].substring(1, parse[2].length - 1);
                            operations.push({op: parse[1], arg: parse[2]});
                        } else
                        // returns array[value]. e.g.: {id.ack;array(ack is false,ack is true)}
                        if (parse[1] === 'array') {
                            operations = operations || [];
                            param = (parse[2] || '').trim();
                            param = param.substring(1, param.length - 1);
                            param = param.split(',');
                            if (Array.isArray(param)) {
                                operations.push ({op: parse[1], arg: param}); //xxx
                            }
                        } else
                        if (parse[1] === '=' ||
                            parse[1] === '!=' ||
                            parse[1] === '>' ||
                            parse[1] === '<' ||
                            parse[1] === '>=' ||
                            parse[1] === '<=' ||
                            parse[1] === 'bit' 
                            ){
                                param = (parse[2] || '').trim();
                                param = param.substring(1, param.length - 1);
                                param = param.split(',');
                                if (Array.isArray(param) && param.length >= 2) {
                                
                                    param[0] = checkValueNumber(param[0]);

                                    if (param[0] === null) {
                                        console.log('Invalid format of format string: ' + format);
                                    } else {
                                        operations = operations || [];
                                        operations.push({op: parse[1], arg: param});
                                    }
                                }
                                else {
                                    parse[2] = checkValueNumber(parse[2]); 

                                    if (parse[2] === null) {
                                        console.log('Invalid format of format string: ' + format);
                                    } 
                                    else {
                                            operations = operations || [];
                                            operations.push({op: parse[1], arg: parse[2]});
                                        }
                                }
                        }
                        else 
                        // value formatting
                        if (parse[1] === 'value') {
                            operations = operations || [];
                            var param = (parse[2] === undefined) ? '(2)' : (parse[2] || '');
                            param = param.trim();
                            param = param.substring(1, param.length - 1);
                            operations.push({op: parse[1], arg: param});
                        } else
                        // operators have optional parameter
                        if (parse[1] === 'pow' || parse[1] === 'round' || parse[1] === 'random') {
                            if (parse[2] === undefined) {
                                operations = operations || [];
                                operations.push({op: parse[1]});
                            } else {
                                parse[2] = (parse[2] || '').trim().replace(',', '.');
                                parse[2] = parse[2].substring(1, parse[2].length - 1);
                                parse[2] = parseFloat(parse[2].trim());

                                if (parse[2].toString() === 'NaN') {
                                    console.log('Invalid format of format string: ' + format);
                                    parse[2] = null;
                                } else {
                                    operations = operations || [];
                                    operations.push({op: parse[1], arg: parse[2]});
                                }
                            }
                        } else
                        if (parse[1] === 'json'){       
                            //json(objPropPath)  ex: json(prop1);  json(prop1.propA)
                            operations = operations || [];
                            parse[2] = (parse[2] || '').trim();
                            parse[2] = parse[2].substring(1, parse[2].length - 1);
                            operations.push({op: parse[1], arg: parse[2]});
                        }else{
                            // operators without parameter
                            operations = operations || [];
                            operations.push({op: parse[1]});
                        }
                    } else {
                        console.log('Invalid format ' + format);
                    }
                }
            }

            result.push({
                visOid: visOid,
                systemOid: systemOid,
                token: oid[p],
                operations: operations ? operations : undefined,
                format: format,
                isSeconds: isSeconds
            });
        }
    }
    return result;
}

//**********************************************************************************/
//Helper  for finding Group of widget(wid) 
//avoids repeated searches for a single widget (optimization)
function GroupHelper(views){
    this.views = views;
    this.view = null;
    this.wid = null;
    this.groupwid = undefined; 
    this.triedFound = false
    
    //reset props for new widget id 
    this.initforWidget = function(view, wid){
        this.view = view;
        this.wid = wid;
        this.groupwid = undefined;
        this.triedFound = false;
    }  

    //getting GroupID for current widget. Fistr cheking local(saved) variable for optimization
    this.tryGetGroupID = function(){
        if ( !this.groupwid && !this.triedFound){
            this.groupwid = getWidgetGroup(this.views, this.view, this.wid);
            this.triedFound = true;
            
            if (this.groupwid)
               this.views[this.view].widgets[this.wid].groupid = this.groupwid;                  
         }

    } 
    //Checking widget attribute value for presence of "groupAttr". if so then replace to actual value
    //If groupAttr Index wrone, then return "groupAttrN" -> "undefine"
    this.checkValue = function(value) {
        let result=value;

        if (value.indexOf('groupAttr')>=0){
        
            this.tryGetGroupID();

            //getting group attributes
            if (this.groupwid && this.views[this.view].widgets[this.groupwid]) {                      //<<<<<< а тут в data только данные по groupAttr ?????
                let res = replaceGroupAttr(value, this.views[this.view].widgets[this.groupwid].data); //Если индекс группы не найден то должен вернуть undefine
                if (res.doesMatch) {
                    result = res.newString;
            }
         }
        }
        else 
        if (this.views[this.view].widgets[this.wid].grouped &&
           !this.views[this.view].widgets[this.wid].groupid){
            this.tryGetGroupID();
           }

        return result;
    }
}

/************************************************************** */
function getUsedObjectIDs(views, isByViews) {
    if (!views) {
        console.log('Check why views are not yet loaded!');
        return null;
    }
    console.info('________INIT PROJECT_____')

    var _views = isByViews ? {} : null;  //null for EditorMode.  After sets this object  to vis.subscribing.byViews{}[]->tagIDs  and for EditMode changing to {}
                                         //Same as IDs[], but groupig by ViewName.
                                         //tagID containing "ViewAttr№...." NOT beginning with "ViewName_"  because  already grouping by ViewName

    var IDs         = [];                //=> vis.subscribing.IDs[]->tagIDs  for filling vis.states[]
                                         //   cannt contain "GroupAttr№..."    
                                         //   cannt contain "ViewAttr№...." because  its used for creating  item in vis.state array

    var visibility  = {};                //=> vis.visibility{tagID}[] 
                                         //    cannt contain "GroupAttr№..."
                                         //      can contain "ViewAttr№...." beginning with "ViewName_". Need to createing clone item late in vis.clones.visibility 

    var bindings    = {};                //=> vis.bindings{tagID}[]
    var lastChanges = {};                //=> vis.lastChanges{tagID}[]
    var signals     = {};                //=> vis.signals{tagID}[]

    var view;
    var id;
    
    //helper to optimize gettting(replacing) "groupAttr" for one widget
    let groupHelper = new GroupHelper(views);

    for (view in views) {
        if (!views.hasOwnProperty(view)) continue;

        if (view === '___settings') continue;

        if (_views) _views[view] = [];

        //Сначала перебираем примитивы извлекаем с типом Relative
        if (vis.editMode){
        let arr=[];
      
        for (id in views[view].widgets) {
            if (!views[view].widgets.hasOwnProperty(id)) continue;

            widgetModel=views[view].widgets[id];
            if (!widgetModel.grouped && widgetModel.style.display=='inline-block' && widgetModel.style["z-index"]) 
            {
                widgetModel['widgetId']=id;
                arr.push(widgetModel);
            }
        }

        if (arr.length > 0){
            arr.sort(function(a,b){
                        let z1 = parseInt(a.style["z-index"]) 
                        let z2 = parseInt(b.style["z-index"])
                        if (z1<z2) return -1
                        if (z1>z2) return 1
                        return 0;
                    }) 
            let newWidgets={};
            for ( let i=0; i<arr.length; ++i){
                newWidgets[arr[i].widgetId]=arr[i];
            }
            

            for (id in views[view].widgets) {
                if (!views[view].widgets.hasOwnProperty(id)) continue;
    
                widgetModel=views[view].widgets[id];
                if (!widgetModel.grouped && widgetModel.style.display=='inline-block' && widgetModel.style["z-index"]) 
                {
                  // уже добавили
                }
                else 
                {
                    newWidgets[id]=widgetModel
                }
          }
           views[view].widgets = newWidgets; 
        }
    }




        //console.debug('loading view:'+ view)
        for (id in views[view].widgets) {
            if (!views[view].widgets.hasOwnProperty(id)) continue;
           
            //console.debug('   loading widget:'+ id)
            widgetModel=views[view].widgets[id];
          
            // Check all attributes
            var data  = widgetModel.data;
            var style = widgetModel.style;
            
            {//Region for version compatibility
            // fix error in naming
            if (widgetModel.groupped) {
                widgetModel.grouped = true;
                delete widgetModel.groupped;
            }

            // rename hqWidgets => hqwidgets
            if (widgetModel.widgetSet === 'hqWidgets') {
                widgetModel.widgetSet = 'hqwidgets';
            }

            // rename RGraph => rgraph
            if (widgetModel.widgetSet === 'RGraph') {
                widgetModel.widgetSet = 'rgraph';
            }

            // rename timeAndWeather => timeandweather
            if (widgetModel.widgetSet === 'timeAndWeather') {
                widgetModel.widgetSet = 'timeandweather';
            }

            // convert "Show on Value" to HTML
            if (widgetModel.tpl === 'tplShowValue') {
                widgetModel.tpl = 'tplHtml';
                widgetModel.data['visibility-oid'] = widgetModel.data.oid;
                widgetModel.data['visibility-val'] = widgetModel.data.value;
                delete widgetModel.data.oid;
                delete widgetModel.data.value;
            }

            // convert "Hide on >0/True" to HTML
            if (widgetModel.tpl === 'tplHideTrue') {
                widgetModel.tpl = 'tplHtml';
                widgetModel.data['visibility-cond'] = '!=';
                widgetModel.data['visibility-oid'] = widgetModel.data.oid;
                widgetModel.data['visibility-val'] = true;
                delete widgetModel.data.oid;
            }

            // convert "Hide on 0/False" to HTML
            if (widgetModel.tpl === 'tplHide') {
                widgetModel.tpl = 'tplHtml';
                widgetModel.data['visibility-cond'] = '!=';
                widgetModel.data['visibility-oid'] = widgetModel.data.oid;
                widgetModel.data['visibility-val'] = false;
                delete widgetModel.data.oid;
            }

            // convert "Door/Window sensor" to HTML
            if (widgetModel.tpl === 'tplHmWindow') {
                widgetModel.tpl = 'tplValueBool';
                widgetModel.data.html_false = widgetModel.data.html_closed;
                widgetModel.data.html_true = widgetModel.data.html_open;
                delete widgetModel.data.html_closed;
                delete widgetModel.data.html_open;
            }

            // convert "Door/Window sensor" to HTML
            if (widgetModel.tpl === 'tplHmWindowRotary') {
                widgetModel.tpl = 'tplValueListHtml8';
                widgetModel.data.count = 2;
                widgetModel.data.value0 = widgetModel.data.html_closed;
                widgetModel.data.value1 = widgetModel.data.html_open;
                widgetModel.data.value2 = widgetModel.data.html_tilt;
                delete widgetModel.data.html_closed;
                delete widgetModel.data.html_open;
                delete widgetModel.data.html_tilt;
            }

            // convert "tplBulbOnOff" to tplBulbOnOffCtrl
            if (widgetModel.tpl === 'tplBulbOnOff') {
                widgetModel.tpl = 'tplBulbOnOffCtrl';
                widgetModel.data.readOnly = true;
            }

            // convert "tplValueFloatBarVertical" to tplValueFloatBar
            if (widgetModel.tpl === 'tplValueFloatBarVertical') {
                widgetModel.tpl = 'tplValueFloatBar';
                widgetModel.data.orientation = 'vertical';
            } 
            }//region end
            
            //Begin handling next widget model
            groupHelper.initforWidget(view, id);

            //----------------------------------------------------------
            //Check tagid for "viewAttr" and if contain make uniq tag (insert PageName at beginnig of the tagID)
            //(for the convenience of differences when debuging)
            function sub_Check_ViewAttr(tagid){
              if (tagid.indexOf('viewAttr') >= 0)
                   return view+'_'+tagid; //create uniq tag 
              else return tagid
            }

            //----------------------------------------------------------
            //define common finction to adding to subscribing Arrays
            function sub_AddtoSubscribingArray(tagid, bindObj=null){
            
                //if (tagid.indexOf('local_')===0) return;   //adding because "local_" need for getting it state  in subscribeStates method 
                if (tagid.indexOf('groupAttr')===0) return;  //skip. we prevent subscribe  

                if ((tagid.indexOf('viewAttr') < 0) &&    //skip. we prevent subscribe and creatig it state 
                    (IDs.indexOf(tagid) === -1)
                   ) IDs.push(tagid);                               
                   
                if (_views && _views[view].indexOf(tagid) === -1)
                   _views[view].push(tagid);   

                if (bindObj){
                    tagid = sub_Check_ViewAttr(tagid);

                    if (!bindings[tagid]) bindings[tagid] = [];
                    bindings[tagid].push(bindObj);
                }            
            }    

            //----------------------------------------------------------
            //define common finction to check binging format
            //(here  'attrValue' already checked for "groupAttr")
            function sub_CheckBindingPresent(attrValue, attr, typeId) {
                var res=false;
                var oids = extractBinding(attrValue);

                if (oids) {
                    res=true;
                    
                    for (var t = 0; t < oids.length; t++) {
                        var ssid = oids[t].systemOid;
                        if (ssid) {
                            oids[t].type = typeId;
                            oids[t].attr = attr;
                            oids[t].view = view;
                            oids[t].widget = id;

                            sub_AddtoSubscribingArray(ssid, oids[t]);
                        }
            
                        if (oids[t].operations && oids[t].operations[0].arg instanceof Array) {
                            for (var ww = 0; ww < oids[t].operations[0].arg.length; ww++) {
                                let opssid = oids[t].operations[0].arg[ww].systemOid;
                                if (opssid && opssid !== ssid) 
                                    sub_AddtoSubscribingArray(opssid,oids[t]);
                            }
                        }
                    }
                }
            
             return res;
            }

            //check all widget attributes 
            for (var attr in data) {
                if (!data.hasOwnProperty(attr) || !attr) continue;
                /* TODO DO do not forget remove it after a while. Required for import from DashUI */
                
                { //region
                if (attr === 'state_id') {
                    data.state_oid = data[attr];
                    delete data[attr];
                    attr = 'state_oid';
                } else
                if (attr === 'number_id') {
                    data.number_oid = data[attr];
                    delete data[attr];
                    attr = 'number_oid';
                } else
                if (attr === 'toggle_id') {
                    data.toggle_oid = data[attr];
                    delete data[attr];
                    attr = 'toggle_oid';
                } else
                if (attr === 'set_id') {
                    data.set_oid = data[attr];
                    delete data[attr];
                    attr = 'set_oid';
                } else
                if (attr === 'temp_id') {
                    data.temp_oid = data[attr];
                    delete data[attr];
                    attr = 'temp_oid';
                } else
                if (attr === 'drive_id') {
                    data.drive_oid = data[attr];
                    delete data[attr];
                    attr = 'drive_oid';
                } else
                if (attr === 'content_id') {
                    data.content_oid = data[attr];
                    delete data[attr];
                    attr = 'content_oid';
                } else
                if (attr === 'dialog_id') {
                    data.dialog_oid = data[attr];
                    delete data[attr];
                    attr = 'dialog_oid';
                } else
                if (attr === 'max_value_id') {
                    data.max_value_oid = data[attr];
                    delete data[attr];
                    attr = 'max_value_oid';
                } else
                if (attr === 'dialog_id') {
                    data.dialog_oid = data[attr];
                    delete data[attr];
                    attr = 'dialog_oid';
                } else
                if (attr === 'weoid') {
                    data.woeid = data[attr];
                    delete data[attr];
                    attr = 'woeid';
                }
                }//region end 

                var attrValue = data[attr];
                var savedValue = attrValue;

                if (typeof attrValue === 'string') {
                  
                    attrValue = groupHelper.checkValue(attrValue);  //Check attrValue for "groupAttr" and replace it
                    attrValue = checkForViewAttr2(attrValue, data); //Check attrValue for "viewAttr" and if "data" contains "viewAttrN"  replace it

                    //try find {xxx} templates in string widget attribute       
                    if (sub_CheckBindingPresent(attrValue, attr, 'data'))
                    {
                        //done. added to binding collections  
                    }
                    else
                    //try check "oid" attributes  
                    if (attr !== 'oidTrueValue'  && 
                        attr !== 'oidFalseValue' && 
                        attrValue &&
                        (attr.match(/oid\d{0,2}$/) || attr.match(/^oid/) || attr.match(/^signals-oid-/) || attr === 'lc-oid')
                       ){

                        //Append tagID to subscribe array
                        if (attrValue !== 'nothing_selected') {
                            sub_AddtoSubscribingArray(attrValue);
                            
                            if (!vis.editMode &&(savedValue != attrValue)) //for run mode, if "groupAttr" changed to realTag 
                                data[attr]=attrValue;
                        }
                        
                        //if contain "ViewAttr" appent prefix "PageName_" (for the convenience of differences when debuging)
                        let tagid = sub_Check_ViewAttr(attrValue); 

                        //filling Visibility binding array
                        if (attr === 'visibility-oid') {
                            if (!visibility[tagid]) visibility[tagid] = [];
                            visibility[tagid].push({
                                    view: view,
                                    widget: id
                            });
                        }
                        else
                        //filling  Signal binding array
                        if (attr.match(/^signals-oid-/) ) {
                            tagid = sub_Check_ViewAttr(attrValue);

                            if (!signals[tagid]) signals[tagid] = [];
                            signals[tagid].push({
                                view:   view,
                                widget: id,
                                index:  parseInt(attr.substring('signals-oid-'.length), 10)
                            });
                        }
                        else
                        //filling  lastChanges array
                        if (attr === 'lc-oid') {

                            tagid = sub_Check_ViewAttr(tagid);

                            if (!lastChanges[tagid]) lastChanges[tagid] = [];
                            lastChanges[tagid].push({
                                view:   view,
                                widget: id
                            });
                        }
                    } 
                    else
                    //try check "contains_view" attributes                          
                    if (attrValue && (attr === 'contains_view')) {
                        if (!vis.editMode &&(savedValue != attrValue)) //for run mode, if "groupAttr" changed to realTag
                            data[attr]=attrValue;
                    }
                    else{
                        var m;
                        // attribute has type="id" (using for groups attr)
                        if ((m = attr.match(/^attrType(\d+)$/)) && data[attr] === 'id') {
                            var _id = 'groupAttr' + m[1];
                            if (data[_id]) 
                                sub_AddtoSubscribingArray(data[_id]);
                        }
                    }
                }
            } //.data

            // build bindings for styles
            if (style) {
                for (var cssAttr in style) {
                    if (!style.hasOwnProperty(cssAttr) || !cssAttr) continue;
                    if (typeof style[cssAttr] === 'string') {
                       
                        attrValue = groupHelper.checkValue(style[cssAttr]); //Check attrValue for "groupAttr" and replace it
                        sub_CheckBindingPresent(attrValue, cssAttr,'style');
                    }
                }
            }//.style
        }
    }

    /*if (_views) {
        var changed;
        do {
            changed = false;
            // Check containers
            for (view in views) {
                if (!views.hasOwnProperty(view)) continue;
                if (view === '___settings') continue;

                for (id in views[view].widgets) {
                    if (!views[view].widgets.hasOwnProperty(id)) continue;
                    widgetModel=views[view].widgets[id];

                    // Add all OIDs from this view to parent
                    if (widgetModel.tpl === 'tplContainerView' && widgetModel.data.contains_view) {     //ПРОВЕРИТЬ ЧТО ЭТО  <<<<<<<<<<<<<<<<<

                        let viewInfo=parseViewURI(widgetModel.data.contains_view);
                        var ids = _views[viewInfo.viewModelId];
                        if (ids) {
                            for (var a = 0; a < ids.length; a++) {
                                let varId =  ids[a];
                                if (varId &&  (varId.indexOf("viewAttr") < 0) &&(_views[view].indexOf(varId) === -1)) {
                                    _views[view].push(varId);
                                    changed = true;
                                }
                            }
                        } else {
                            console.warn(`View does not exist: "${widgetModel.data.contains_view}" on View:"${view}" Widget:"${id}"`);
                        }
                    }
                }
            }
        } while (changed);
    }*/

    return {IDs: IDs,  //список тегов (стррок)
            byViews: _views, //список тегов по кадрам
            visibility: visibility,
            bindings: bindings, //соварь  тег - объект
            lastChanges: lastChanges, 
            signals: signals
        };

 //Notice: All widgets attributes with binding instuctions will be changed to real values  in vis.createIds()
}

/**********************************************************************************/
if (typeof module !== 'undefined' && module.parent) {
    module.exports.getUsedObjectIDs = getUsedObjectIDs;
}

/**********************************************************************************/
//check all widget data/style attributes  in 'widgetModel' and 
// - replace all "groupAttr to real value
// - replace all "viewAttr to real value
// calc all bindings and replace attribute value
//
//ONLY for EDITMODE when rendering widget! (for ordinary and cloning widget)
//widgetModel  must be a copy of  vis.views[xx].widgets[xx]
/**********************************************************************************/
function updateWidgetModel(vis, widgetModel, groupId, widgetId, viewInfo) {
    var data  = widgetModel.data;
    var style = widgetModel.style;

    //helper to optimize gettting(replacing) "groupAttr" for one widget
    //let groupHelper = new GroupHelper(vis.views);
    //groupHelper.initforWidget(viewInfo.viewModelId, undefined, groupId);

    for (var attr in data) {
        if (!data.hasOwnProperty(attr) || !attr) continue;
        var attrValue = data[attr];
        
        if (typeof attrValue === 'string') {
          
            attrValue = checkForGroupAttr(vis, attrValue, groupId, viewInfo.viewModelId);
            
             //Check attrValue for "viewAttr" and replace it
            if (viewInfo.isClone)
                 attrValue = checkForViewAttr(attrValue, viewInfo)
            else attrValue = checkForViewAttr2(attrValue, widgetModel.data);

            data[attr] = vis.formatBinding(attrValue, viewInfo.viewID, widgetId, widgetModel)
        }
    }

    for (var cssAttr in style) {
        if (!style.hasOwnProperty(cssAttr) || !cssAttr) continue;
        
        var attrValue = style[cssAttr];
        if (typeof attrValue === 'string') {

            attrValue = checkForGroupAttr(vis, attrValue, groupId, viewInfo.viewModelId);
            //Check attrValue for "viewAttr" and replace it
            if (viewInfo.isClone)
                attrValue = checkForViewAttr(attrValue, viewInfo) 
            else attrValue = checkForViewAttr2(attrValue, widgetModel.data);

            style[cssAttr] = vis.formatBinding(attrValue, viewInfo.viewID, widgetId, widgetModel)
        }
    }
}



 /**********************************************************************************/