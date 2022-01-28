/*****
 ***** Query
 *****/

class Query {

    constructor(UniDB_instance, slug, parameters) {
        this.D = UniDB_instance;                    // pointer to parent UniDB instance
        this.tableName = slug;                      // URL name
        // remaining tasks will be left to init() for easy overriding
        this.init(parameters);
        // call reset to initialise navigation values, filters, etc.
        this.reset();
    }

    init(parameters) {
        this.section = 'query';
        this.description = parameters.description;  // Human-readable name
        this.hidden = parameters.hidden;
        this.searchable = parameters.searchable;
        this.underlyingTable = parameters.underlying_table;
        this.priKey = ( this.underlyingTable ? this.D.T(this.underlyingTable).priKey : '_count' );
        this.allowNew = ( this.underlyingTable ? this.D.T(this.underlyingTable).allowNew : false );
        this.allowEdit = ( this.underlyingTable ? this.D.T(this.underlyingTable).allowEdit : false );
        this.allowDelete = ( this.underlyingTable ? this.D.T(this.underlyingTable).allowDelete : false );
        // these are for user queries
        this.userQuery = true;
        this.sql = parameters.sql;
        this.owner = parameters.owner;
        this.isPublic = parameters.is_shared;
    }

    /* reset(): clear options, such as filters, number of records to skip, ... */
    reset() {
        this.options = {
            offset: 0,
            limit: this.D.getPagesize()
        };
    }

    /* navigate(): refresh URL hash with current options */
    navigate() {
        // use UniDB instance navigate function to change URL
        this.D.navigate(this.section, this.tableName, this.options);
        // this will trigger a new call to show()
    }

    /* click_first(): return closure that will go to first page */
    click_first() {
        var T = this;
        return(function() {
            T.reset();
            T.navigate();
        });
    }

    /* click_last(): return closure that will go to last page */
    click_last(count) {
        var T = this;
        return(function() {
            T.options.offset = Math.floor((count-1)/T.options.limit) * T.options.limit;
            T.navigate();
        });
    }

    /* click_prev(): return closure that will go to first page */
    click_prev() {
        var T = this;
        return(function() {
            T.options.offset = Math.max(0, T.options.offset - T.options.limit);
            T.navigate();
        });
    }

    /* click_next(): return closure that will go to first page */
    click_next(count) {
        var T = this;
        return(function() {
            if ( T.options.offset + T.options.limit < count ) {
                T.options.offset = T.options.offset + T.options.limit;
                T.navigate();
            }
        });
    }

    /* show(): the main function of the class, list records  */
    show() {
        var T = this;    // safe in separate variable, since "this" points to sth else in callbacks
        var i, j;    // counters
        // set UniDB Object's current Table to this one
        T.D.currentTable = this;
        // fall back to default values
        if (!T.options.hasOwnProperty('offset') || isNaN(T.options.offset)) {
            T.options.offset = 0;
        }
        if (!T.options.hasOwnProperty('limit') || isNaN(T.options.limit)) {
            T.options.limit = this.D.getPagesize();
        }
        // run query
        T.D.cmd('GET', '/' + T.section + '/' + T.tableName + '/', T.options, function (data) {
            // keep the data in Table/Query instance
            T.data = data
            // empty the content area and table-specific toolbars
            var tContent    = $("#content").text("").removeClass("homepage");
            var tInfo    = $("#table_info").text("");
            var tButtons    = $("#table_buttons").text("");
            var tNav    = $("#table_nav").text("");
            var tSearch    = $("#table_search").text("");
            var first_record = T.options.offset + 1
            var last_record = ( T.options.offset + T.options.limit < data.count ? T.options.offset + T.options.limit : data.count );
            // create navigation bar
            $("<button/>", { html: "first record" } )
                .button({ text: false, icons: { primary: "ui-icon-seek-start" }})
                .click(T.click_first())
                .appendTo(tNav);
            $("<button/>", { html: "page up" } )
                .button({ text: false, icons: { primary: "ui-icon-seek-prev" }})
                .click(T.click_prev())
                .appendTo(tNav);
            $("<button/>",{ id: "refresh_table",
                    html: first_record + "-" + last_record + " of " + data.count + " records" } )
                    //html: (T.options.offset + 1) + "-" + (T.options.offset + T.options.limit + 1) + " of " + data.count + " records" } )
                .button()
                .click(function() { T.show(); })    // basically this just reloads the table
                .appendTo(tNav);
            $("<button/>", { html: "page down" } )
                .button({ text: false, icons: { primary: "ui-icon-seek-next" }})
                .click(T.click_next(data.count))
                .appendTo(tNav);
            $("<button/>", { html: "last page" } )
                .button({ text: false, icons: { primary: "ui-icon-seek-end" }})
                .click(T.click_last(data.count))
                .appendTo(tNav);
            tNav.buttonset();
            // text search
            if (T.searchable) {
                $("<input/>", { id: "search_term", type: "text", placeholder: "Search table ...", value: T.options.search })
                    .prop("size","25")
                    .appendTo(tSearch)
                    .wrap($("<form/>", { name: "search_form", id: "search_form" }));
                $("#search_form").submit(function () {
                    T.options.offset = 0;
                    T.options.search = $("#search_term").val();
                    T.navigate();
                    return(false);
                });
            }
            // download (CSV) button
            $("<button/>", { html: "Download" } )
                .button({ icons: { primary: "ui-icon-arrowthickstop-1-s" }})
                .click( { T: T }, T.download)
                .appendTo(tButtons);
            // new record button (unless for VIEW's)
            if (T.allowNew) {
                $("<button/>", { text: "New" } )
                    //.data( { "table": (data.underlyingTable ? data.underlyingTable : table ), "options": options } )
                    .button({ icons: { primary: "ui-icon-document" }})
                    .click( function() {
                        new Record( (T.underlyingTable ? T.D.T(T.underlyingTable) : T ), undefined,
                            function(newRecord) {
                                if (T.options.filter) {
                                    for (var key in T.options.filter) {
                                        var tableColumn = key.split(".");
                                        newRecord.Fields[tableColumn[1]].oldValue = T.options.filter[key];
                                    }
                                }
                                new Dialog(T.D.dialogWindow, newRecord);
                            });
                    })
                    .appendTo(tButtons);
            }
            // table info
            if (T.userQuery) {
                $("<button/>", { text: "Edit query" } )
                    .button({ icons: { primary: "ui-icon-pencil" }})
                    .click(function() { T.modify(); })
                    .appendTo(tButtons);
            }
            // show table/query name
            $("<span/>", { html: T.D.stripText(T.description, true) })
                .appendTo(tInfo);
            // now make an actual table
            var table = $("<table/>", { id: "content_table" });
            var tableHead = $("<thead/>");
            var tableBody = $("<tbody/>");
            var columnNames = $("<tr/>", { id: "column_names" });
            var filters = $("<tr/>", { id: "filters" });
            $("<th/>").appendTo(columnNames); // empty first cell (column for buttons)
            $("<th/>").appendTo(filters);
            for (var column in ( T.columns ? T.columns : data.columns)) {
                var column_name = T.columns ? T.columns[column] : data.columns[column];
                if (column_name[0] == "_") {
                    continue; // skip hidden columns
                }
                // first header spans two columns: action buttons and first data column
                var header = $("<th/>");
                var header2 = $("<th/>");
                // button
                $("<button/>", { href: "#", text: column_name, "class": "sort-button" } )
                    .addClass( (T.options.ordering == column)
                        || (T.options.ordering == '-' + column ) ? "column-sorted" : undefined )
                    .button({ icons: { secondary: ( T.options.ordering == column ?
                        "ui-icon-triangle-1-n" : ( T.options.ordering == "-" + column ?
                        "ui-icon-triangle-1-s" : "ui-icon-triangle-2-n-s" ) ) }})
                    .click( {    T:    T,
                            column:    column,
                            desc:    ( T.options.ordering == column ? 1 : 0 ) } ,
                        T.sortFunction )
                    .appendTo(header);
                // filter drop down
                if (data.facets && data.facets[column]) {
                    var filterOuter = $("<div/>", { "class": "filter-outer" } );
                    $("<span/>", { "class": "filter-button" })
                        .on("click", { T: T, column: column }, T.unfilterFunction)
                        .appendTo(filterOuter);
                    var filter = $("<select/>", { "class": "filter-select" });
                    $("<option/>", { value: undefined, text: '[all]' }).appendTo(filter);
                    for (var o=0; o < data.facets[column].length; o++) {
                        var label =
                            ( data.facets[column][o][0] === null
                            ? "[not assigned]"
                            :   ( data.facets[column][o][2]
                                    ? data.facets[column][o][2]
                                    :   ( typeof data.facets[column][o][0] == "boolean"
                                        ? ( data.facets[column][o][0] ? "Yes" : "No" )
                                        : data.facets[column][o][0]
                                        )
                                )
                            );
                        var option = $("<option/>", {
                                value:    data.facets[column][o][0] === null ? 'NULL' : data.facets[column][o][0],
                                 text:    T.D.stripText(label, false) + " (" + data.facets[column][o][1] + ")",
                                 title:    label
                        });
                        if ( T.options[column] !== undefined && (
                                T.options[column] == data.facets[column][o][0]
                             || ( T.options[column] == 'NULL' && data.facets[column][o][0] === null)
                             || ( typeof data.facets[column][o][0] == "boolean" && (
                                    (T.options[column] == "true" && data.facets[column][o][0])
                                 || (T.options[column] == "false" && ! data.facets[column][o][0])
                                ) )
                            ) ) {
                            option.prop("selected","selected");
                            filter.addClass("filter-active");
                            filterOuter.find(".filter-button").addClass("filter-active");
                        }
                        option.appendTo(filter);
                    }
                    filter.on("change", { T: T, column: column }, T.filterFunction);
                    filter.appendTo(filterOuter);
                    filterOuter.appendTo(header2);
                }
                header.appendTo(columnNames);
                header2.appendTo(filters);
            }
            columnNames.appendTo(tableHead);
            filters.appendTo(tableHead);
            tableHead.appendTo(table);
            for (var i=0; i < data.results.length; i++) {
                var thisKey = ( T.priKey == "_count" ? i : data.results[i][T.priKey]);
                var row = $("<tr/>", { id: "data_"+thisKey });
                row.click(T.rowClickFunction);
                var actButtons = $("<div/>");
                if (thisKey !== undefined) {
                    $("<button/>", { html: (T.allowEdit ? "Edit" : "View") } )
                        .button({    text:    false,
                                icons:    { primary: (T.allowEdit ? "ui-icon-pencil" : "ui-icon-search") }})
                        .click(    {     T:    (T.underlyingTable ? T.D.T(T.underlyingTable) : T ),
                                value:    thisKey } , (T.underlyingTable ? T.D.T(T.underlyingTable).editFunction : T.editFunction) )
                        .appendTo(actButtons);
                    $("<button/>", { html: "Fill template" } )
                        .button({    text:    false,
                                icons:    { primary: "ui-icon-copy" }})
                        .click(    {     T:    (T.underlyingTable ? T.D.T(T.underlyingTable) : T ) ,
                                value:    thisKey } , T.downloadOneFunction )
                        .appendTo(actButtons);
                    if (T.allowDelete) {
                        $("<button/>", { html: "Delete" } )
                            .button({ text: false, icons: { primary: "ui-icon-trash" }})
                            .click( {    T:    (T.underlyingTable ? T.D.T(T.underlyingTable) : T ),
                                    value:    thisKey,
                                    name:    data.results[i]['_label'] } , (T.underlyingTable ? T.D.T(T.underlyingTable).deleteFunction : T.deleteFunction) )
                            .appendTo(actButtons);
                    }
                }
                actButtons.buttonset();
                $("<td/>", { class: "edit-delete-buttons" }).append(actButtons).appendTo(row);
                for (var column in ( T.columns ? T.columns : data.columns )) {
                    var column_name = T.columns ? T.columns[column] : data.columns[column];
                    if (column_name[0] != "_") {
                        var cell = $("<td/>", { html: ( typeof data.results[i][column] == "boolean"
                                        ? ( data.results[i][column] ? "Yes" : "No" )
                                        : T.D.stripText(data.results[i][column], true)
                                    ) });
                        cell.appendTo(row);
                    }
                }
                row.appendTo(tableBody);
            }
            tableBody.appendTo(table);
            table.appendTo("#content");
        }); // D.cmd
    }

    /* modify() : edit user query */
    modify() {
        var T = this;

        if (this.userQuery) {    // if not userQuery, it cannot be modified
            // menu of tables & columns
            var tableSelect = [ ];
            var columnSelect = $("<ul/>");
            $("<li/>", { html: "Columns:" } ).appendTo(columnSelect);
            $("<li/>", { html: "-" } ).appendTo(columnSelect);
            $.each(T.D.Tables, function(table, tableObj) {
                tableSelect.push({ value: table, display_name: tableObj.description + " [" + table + "]" });
                var thisTable = $("<li/>");
                $("<a/>", { html: tableObj.description }).appendTo(thisTable);
                var tableColumns = $("<ul/>");
                $.each(tableObj.columns, function(column, description) {
                    $("<a/>", { html: column + ": " + description })
                        .appendTo(tableColumns)
                        .on("click", function (e) {
                            var oldVal = $("#-sql").val();
                            var pos = oldVal.length;    // default: at the end
                            var posEnd = pos;
                            // if query is focused, add at cursor position/replace marked text
                            if ($("#-sql").is(":focus")) {
                                pos = $("#-sql").prop("selectionStart");
                                posEnd = $("#-sql").prop("selectionEnd");
                            }
                            var insert = table + "." + column;
                            // add space before/after if not already there
                            if ( (pos > 0) && (oldVal.charAt(pos-1) != " ") ) {
                                insert = " " + insert;
                            }
                            if ( (posEnd < oldVal.length) && (oldVal.charAt(posEnd) != " ") ) {
                                insert = insert + " ";
                            }
                            // set new string
                            var newVal = oldVal.substr(0, pos) + insert + oldVal.substr(posEnd);
                            $("#-sql").val(newVal);
                            // position cursor after inserted text, mark nothing
                            $("#-sql").prop("selectionStart", pos + insert.length);
                            $("#-sql").prop("selectionEnd", pos + insert.length);
                        })
                        .wrap($("<li/>"));
                });
                tableColumns.appendTo(thisTable);
                thisTable.appendTo(columnSelect);
            });
            columnSelect.menu();
            var form = {
                    columns:            {                       type: "raw",        value: columnSelect },
                    name:               { label: "ID",          type: "readonly",   value: T.tableName },
                    description:        { label: "Name",        type: "string",     value: T.description,       size: 50 },
                    sql:                { label: "SQL",         type: "text",       value: T.sql },
                    underlyingTable:    { label: "Main table",  type: "choice",     value: T.underlyingTable,   choices: tableSelect },
                    owner:              { label: "Owner",       type: "readonly",   value: T.owner },
                    isPublic:           { label: "Public?",     type: "boolean",    value: T.isPublic }
                };
            new SimpleDialog(T.D, "edit-query", "Edit Query", form, function(dialog, callback) {
                T.D.cmd("PUT", '/query/' + T.tableName, {
                        description:        dialog.Fields["description"].value(),
                        sql:                dialog.Fields["sql"].value(),
                        underlying_table:   dialog.Fields["underlyingTable"].value(),
                        is_shared:          dialog.Fields["isPublic"].value(),
                    }, function(result) {
                        T.init(result);
                        T.show();
                        callback();
                    });
            });
        } else {
            console.log("Warning: tried to modify system Query - ignored.");
        }
    }

    /* download(): download current list as CSV file (called by download button click) */
    download(evnt) {
        // we extend an empty object, in order not to modify the existing options, and the skip value is removed
        // (= download is always complete)
        var T = evnt.data.T;

        T.D.cmd('GET', '/' + T.section + '/' + T.tableName + '/download/', T.options,
            function (data) {
                var CSV = new Blob([ data ], { type: MIME_CSV } );
                var url = URL.createObjectURL(CSV);
                document.location = url;
            }, undefined, MIME_CSV );
        return(false);
    }

    /* getRecord() : return a single record including metadata, for dialog */
    getRecord(key, keyColumn, callback) {
        var T = this;
        var metadata = {
            field_order: [],
            fields: {}
        };
        var data = {};
        for (var column in T.data.columns) {
            metadata["field_order"].push(T.data.columns[column]);
            metadata["fields"][column] = {
                name:       T.data.columns[column],
                label:      ( T.data.columns[column][0] == "_" ? T.data.columns[column].slice(1) : T.data.columns[column] ),
                type:       "pre"
            };
            data[column] = T.data.results[key][column];
        }
        callback(metadata, data);
    }

    /***
     *** Event handlers:
     ***
     *** These functions all get their parameters through the data Object part of the event Object.
     ***
     *** Since 'this' usually refers to the event, they all normally need a parameter 'T',
     *** referring to the Table object. If function is not called as an event handler, 'T'
     *** does not need to be specified and 'this' will be used.
     ***
     ***/

    /* sortFunction(): sort by specified column */
    sortFunction(evnt) {
        var T = ( evnt.data.T ? evnt.data.T : this );
        T.options.ordering = ( evnt.data.desc ? "-" + evnt.data.column : evnt.data.column );
        T.options.offset = 0;
        T.navigate();
    }

    /* filterFunction(): filter by selection */
    filterFunction(evnt) {
        var T = ( evnt.data.T ? evnt.data.T : this );
    /*    if (typeof T.options.filter == "undefined") {
            T.options.filter = {};
        }*/
        if (evnt.target.value == "[all]") {
            delete T.options[evnt.data.column];
            $(evnt.target).removeClass("filter-active");
            $(evnt.target).parent().find(".filter-button").removeClass("filter-active");
        } else {
            T.options[evnt.data.column] = evnt.target.value;
            $(evnt.target).addClass("filter-active");
            $(evnt.target).parent().find(".filter-button").addClass("filter-active");
        }
        T.options.offset = 0;
        T.navigate();
    }

    /* unfilterFunction(): reset filter for column */
    unfilterFunction(evnt) {
        var T = evnt.data.T;
        $(evnt.target).removeClass("filter-active")
            .parent().find(".filter-select")
            .val("[all]")
            .removeClass("filter-active");
        if (typeof T.options[evnt.data.column] != "undefined") {
            delete T.options[evnt.data.column];
            T.options.offset = 0;
            T.navigate();
        }
    }

    /* editFunction() : in case of Query, actually _view_ record in pop-up */
    editFunction(evnt) {
        var T = ( evnt.data.T ? evnt.data.T : this );
        new Record(T, evnt.data.value, evnt.data.key, function(newRecord) {
            new Dialog(T.D.dialogWindow, newRecord);
        });
        if (typeof evnt.stopPropagation === "function") {
            evnt.stopPropagation();
        }
    }

    /* downloadOneFunction() : download record as ODF - function for file select event */
    downloadOne(evnt) {

        var T = $(evnt.target).data("T");
        var keyColumn = $(evnt.target).data("key");
        var keyValue = $(evnt.target).data("value");
        var file = evnt.target.files[0];

        JSZip.loadAsync(file).then(function(zip) {
            var metaFile = zip.file("meta.xml");
            if (metaFile) {
                metaFile.async("string").then(
                    function(data) {
                        var metaXml = $.parseXML(data);
                        var metaContainer = metaXml.getElementsByTagNameNS(NS_ODF_OFFICE, "meta")[0];
                        var metaNodes = metaContainer.getElementsByTagNameNS(NS_ODF_META, "user-defined");
                        T.D.cmd("GET", "/" + T.section + "/" + T.tableName + "/" + keyValue + "/nested/",
                            { "key": keyColumn },
                            function (raw_record) {

                                function flatten(input, prefix) {
                                    var output = new Object();
                                    if (prefix) {
                                        prefix = prefix + '_';
                                    } else {
                                        prefix = '';
                                    }
                                    for (var i in input) {
                                        if (typeof(input[i]) == 'object') {
                                            Object.assign(output, flatten(input[i], prefix + i));
                                        } else {
                                            output[prefix + i] = input[i];
                                        }
                                    }
                                    return(output);
                                }
                                var record = flatten(raw_record, T.tableName);

                                var metaOld = new Array;
                                for(var i = 0; i < metaNodes.length; i++) {
                                    var metaName = metaNodes[i].getAttributeNS(NS_ODF_META, "name");
                                    if (typeof record[metaName] != "undefined") {
                                        metaOld.push(metaNodes[i]);
                                    } else if (!metaName.startsWith("title_esg") && !metaName.startsWith("_")) {
                                        // mark unknown/old fields used - ESG titles ignored, underscore can be used for other fields
                                        metaNodes[i].textContent = "??? unknown field: " + metaName;
                                    }
                                }
                                for(var i in metaOld) {
                                    metaContainer.removeChild(metaOld[i]);
                                }
                                var metaPrefix = metaContainer.lookupPrefix(NS_ODF_META);
                                for(var metaName in record) {
                                    var metaNew = document.createElementNS(NS_ODF_META, metaPrefix + ":user-defined");
                                    metaNew.textContent = record[metaName];
                                    metaNew.setAttributeNS(NS_ODF_META, metaPrefix + ":name", metaName);
                                    metaNew.setAttributeNS(NS_ODF_META, metaPrefix + ":value-type", "string");
                                    metaContainer.appendChild(metaNew);
                                }
                                var xs = new XMLSerializer();
                                zip.file("meta.xml", xs.serializeToString(metaXml));
                                zip.generateAsync({ type: 'blob', mimeType: MIME_ODF })
                                    .then(function (blob) {            // 1) generate the zip file as Blob
                                        var url = URL.createObjectURL(blob);
                                        document.location = url;    // 2) download Blob
                                    }, function (err) {
                                        window.alert(err);
                                    });
                            }, undefined);
                    },
                    function(e) {
                        window.alert("cannot read: "+e.message);
                    });
            } else {
                window.alert("File meta.xml not found, are you sure it's an OpenOffice document?");
            }
        }, function (e) {
            window.alert("Error reading file: " + e.message);
        });
    }

    /* downloadOneFunction() : download record as ODF - function for button event */
    downloadOneFunction(evnt) {
        var T = ( evnt.data.T ? evnt.data.T : this );
        var input = $(document.createElement("input"));
        input.attr("type", "file")
            .data("T", T)
            .data("key", ( evnt.data.key ? evnt.data.key : T.priKey ))
            .data("value", evnt.data.value )
            .change(T.downloadOne)
            .trigger("click"); // opening dialog
        if (typeof evnt.stopPropagation === "function") {
            evnt.stopPropagation();
        }
    }

    relatedFunction(evnt) {
        var T = ( evnt.data.T ? evnt.data.T : this );
        if (evnt.data.count == 0) {    // we immediately create a new record
            new Record(T, undefined,
                function(newRecord) {
                    newRecord.Fields[evnt.data.relatedColumn].oldValue = evnt.data.value;
                    new Dialog(T.D.dialogWindow, newRecord);
                });
        } else if (evnt.data.unique) {
            new Record(T, evnt.data.value, evnt.data.relatedColumn,
                function(newRecord) {
                    new Dialog(T.D.dialogWindow, newRecord);
                });
        }
        if (! evnt.data.unique) {
            T.reset();
            T.options[evnt.data.relatedColumn] = evnt.data.value;
            T.D.dialogWindow.dialog("close");
            T.navigate();
        }
    }

    /* rowClickFunction() : mark (= highlight) or unmark a row in the table */
    rowClickFunction(evnt) {
        if ($(evnt.currentTarget).hasClass('selected')) {
            $(evnt.currentTarget).removeClass('selected');
        } else {
            $(evnt.currentTarget).addClass('selected');
        }
    }

}

