/*****
 ***** Table
 *****/

class Table extends Query {

    init(parameters) {
        this.section = 'table';
        this.priKey = parameters.priKey;
        this.description = parameters.description;  // Human-readable name
	    this.hidden = parameters.hidden;
        this.searchable = parameters.searchable;
        this.includeGlobalSearch = parameters.includeGlobalSearch,
        this.allowNew = parameters.allowNew;
        this.allowEdit = parameters.allowEdit;
        this.allowDelete = parameters.allowDelete;
        // columns
        this.columns = {};
        this.columns[this.priKey] = parameters.columns[this.priKey]; // list priKey first
        for (var column in parameters.columns) {
            if (column != this.priKey && column != '_label') { // other columns
                this.columns[column] = parameters.columns[column];
            }
        }
    }

    /* deleteFunction(): delete one record after confirmation (called by delete button click) */
    deleteFunction(evnt) {
        var T = ( evnt.data.T ? evnt.data.T : this );
        var options = {};
        options[T.priKey] = evnt.data.value;
        window.confirm("Are you sure you want to delete " + (evnt.data.name ? evnt.data.name : evnt.data.value)+"?")
            && T.D.cmd("DELETE", "/" + T.section + "/" + T.tableName + "/" + evnt.data.value, options, function () {
                T.show();	// afterwards, refresh the current view
            } );
        if (typeof evnt.stopPropagation === "function") {
            evnt.stopPropagation();
        }
    }

    /* editFunction() : edit record specified by data */
    editFunction(evnt) {
        var T = ( evnt.data.T ? evnt.data.T : this );
        new Record(T, evnt.data.value, evnt.data.key, function(newRecord) {
            new Dialog(T.D.dialogWindow, newRecord);
        });
        if (typeof evnt.stopPropagation === "function") {
            evnt.stopPropagation();
        }
    }

    /* getRecord() : load a single record including metadata */
    getRecord(key, keyColumn, callback) {
        var T = this;
        var options = {}
        if (keyColumn != T.priKey) {
		    options["key"] = keyColumn; // pass name of key column (if not PRIMARY KEY)
        }
	    T.D.cmd("OPTIONS", "/" + T.section + "/" + T.tableName + "/" + (key != undefined ? key : "" ) , options, function (metadata) {
            if (key != undefined) {
                T.D.cmd("GET", "/" + T.section + "/" + T.tableName + "/" + (key != undefined ? key : "" ) , options, function (data) {
                    callback({ "field_order": metadata["field_order"], "fields": metadata["actions"]["PUT"] }, data);
                });
            } else {
                callback({ "field_order": metadata["field_order"], "fields": metadata["actions"]["POST"] }, {});
            }
		});
    }
}
