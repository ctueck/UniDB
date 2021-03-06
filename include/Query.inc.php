<?php

class SimpleQuery {

	protected $D;			// UniDB parent object
	
	public $name;			// name
	public $description;		// display name
	public $isUserQuery;		// flag: user (= editable) quer
	public $saveQuery;		// flag: save query?
	public $isPublic;		// flag: public query?
	public $underlyingTable = null;	// set underlying main table (to edit records later on)
	public $mtime;			// last-modified timestamp

	public $sqlQuery;		// the actual query stub (built by constructor, w/o WHERE and ORDER BY)

	public $priKey = "_count";	// frontend needs a PRIMARY KEY to identify records

	public $nameColumn = null;	// index of column that has the row's "name"
					// (defaults to first column if nothing better can be guessed)

	public $allowNew = false;	// permissions to add new records,
	public $allowEdit = false;	// edit records,
	public $allowDelete = false;	// or delete records

	public $searchable = false;	// whether or not Query is searchablea

	public $Templates = array();	// Templates used for this query

	/* routing table for REST API - NB: static! */
	public static $routingTable = array(
		"NULL" =>	array(	"GET" =>	"getTable",
					"PUT" =>	"modify"		),
		"lock" =>	array(	"POST" =>	"lock",
					"DELETE" =>	"unlock"		),
		"*" =>		array(	"GET" =>	"getRecord"		)
	);

	public function __construct (&$D, $queryConf) {
		// &$D        : parent UniDB object
		// $queryConf : properties are description, columns, condition, orderBy
		$this->D =& $D;
		if (!isset($this->name)) {
			$this->name = ( isset($queryConf['name']) ? $queryConf['name'] : $this->newId() );
		}
		$this->description = ( isset($queryConf['description']) ? $queryConf['description'] : "[temporary] " . $queryConf['sql'] );
		$this->isUserQuery = ( isset($queryConf['userQuery']) ? $queryConf['userQuery'] : false );
		$this->saveQuery = ( isset($queryConf['saveQuery']) ? $queryConf['saveQuery'] : false );
		$this->isPublic = ( isset($queryConf['isPublic']) ? $queryConf['isPublic'] : false );
		$this->underlyingTable = ( isset($queryConf['underlyingTable']) && strlen($queryConf['underlyingTable']) > 0 ? $queryConf['underlyingTable'] : null );
		$this->mtime = time();

		$this->initialise($queryConf);

		// initialise might change underlyingTable -> thus we can set permissions only now
		if (isset($this->underlyingTable)) {
			// if we have an underlying table, permissions are equal
			$this->allowNew = $this->D->T($this->underlyingTable)->allowNew;
			$this->allowEdit = $this->D->T($this->underlyingTable)->allowEdit;
			$this->allowDelete = $this->D->T($this->underlyingTable)->allowDelete;
			// and we use the table's PRIMARY KEY as ours
			$this->priKey = $this->D->T($this->underlyingTable)->priKey;
		} else {
			// otherwise, it will be read-only
			$this->allowNew = false;
			$this->allowEdit = false;
			$this->allowDelete = false;
		}

		// if the initialise() hasn't found a name column, it will be the first one
		if (!isset($this->nameColumn)) {
			$this->nameColumn = 0;
		}
		$this->D->log("[QUERY] ".$this->name.": ".$this->description);

	}

	/* internal functions */

	protected function newId () {
		/* newId() : generate unique ID as query name */
		$tryId = md5(microtime().$_SERVER['REMOTE_ADDR']);
		if ($this->D->Q($tryId)) {	// collision
			return($this->newId());		// -> recursively look further
		} else {
			return($tryId);			// uniqze ID found
		}
	}

	protected function initialise ($queryConf) {
		/* the real constructor: called from generic constructor */
		if (isset($queryConf['sql'])) {
			$this->setQuery($queryConf['sql']);
		}
	}

	protected function setQuery ($query) {
		// wrapper to perform sanity checks - currently only very basic
		// does query start with SELECT?
		if (preg_match('/^\s*SELECT/i', $query)) {
			$this->searchable = preg_match("/\/\*.*\*\//", $query);
			$this->sqlQuery = $query;
		} else {
			$this->D->error("Forbidden query: '".$query."' does not start with SELECT.", 403);
		}
	}

	protected function prepareQuery ($options, $fullResult) {
		// prepareQuery() : prepares the actual query to be run, depending on the options submitted
		//                  > used by run() and editRecord()

		// initialise
		$query = $this->sqlQuery;

		// insert search conditions, if search term given
		if (isset($options['search']) && (strlen($options['search']) > 0) && $this->searchable) {
			$query = preg_replace(array('/\/\*+/','/\*+\//'), '', $query);
			$query = preg_replace('/\%s/', $options['search'], $query);
		} elseif ($this->searchable) {
			$query = preg_replace('/\/\*+.*?\*+\//', '', $query);
		} elseif (isset($options['search']) && (strlen($options['search']) > 0)) {
			$this->D->log("Search term on non-searchable query - will have no effect.", true);
		}

		if (isset($options['order'])) {	// ordering chosen in UI
			$query = preg_replace('/\s+ORDER\s+BY\s+.*$/is', '', $query);	// remove ORDER BY if exist
			$query .= "\nORDER BY ".$options['order'];			// add new ORDER BY clause
		}

		return(array(	'query' =>		$query,
				'options' =>		$options,
				'fullResult' =>		$fullResult,
				'countQuery' =>		null,
				'columns' =>		null ));
	}

	protected function run ($argument) {
		/* the function actually executing the query, as prepared by prepareQuery() */
		$query = $argument['query'];
		$countQuery = $argument['countQuery'];
		$columnInfo = $argument['columns'];
		$options = $argument['options'];
		$fullResult = $argument['fullResult'];

		$result = array();
		$result['nameColumn'] = $this->nameColumn;

		if ($fullResult) {	// full result = skip no rows, and no need to determine total rows before
			$skipRows = 0;
		} else {		// view mode = check total results (provided in UI) and set rows to skip
			if (isset($countQuery)) {	// if we have a countQuery, we can just run it ...
				$totalRows = $this->D->query($countQuery)->fetchColumn();
			} else {			// ... otherwise we need to run the whole query, without LIMIT
				$r = $this->D->query($query);
				$totalRows = $r->rowCount();
			}
			$skipRows = isset($options['skip']) ? $options['skip'] : 0;
			$query .= "\nLIMIT ".$this->D->conf("pageresults")." OFFSET $skipRows";
		}

		// now, run the main query
		$r = $this->D->query($query);
		
		$this->D->log("-- returned ".$r->rowCount()." rows");

		// now the real result - first metadata and navigation
		if (! $fullResult) {
			// data needed for navigation, if we don't fetch full result
			$result["pageUp"] = ($skipRows - $this->D->conf("pageresults") >= 0
						? $skipRows - $this->D->conf("pageresults") : 0 );
			$result["firstRecord"] = $skipRows + 1;
			$result["lastRecord"] = $skipRows + $r->rowCount();
			$result["totalRecords"] = $totalRows;
			$result["pageDown"] = ($skipRows + $this->D->conf("pageresults") < $totalRows
						? $skipRows + $this->D->conf("pageresults") : $skipRows );
			$result["lastPage"] = ($totalRows - $this->D->conf("pageresults") >= 0
						? $totalRows - $this->D->conf("pageresults") : 0);
		}

		$result["columns"] = array();
		for ($i = 0; $i < $r->columnCount(); $i++) {
			$column = $r->getColumnMeta($i)["name"];
			if ( !isset($this->underlyingTable)
			  || ($column !=  ($this->underlyingTable."_".$this->D->T($this->underlyingTable)->priKey) )
			  || $fullResult ) {	// skip primary key, unless full result requested
				$result["columns"][] = array(
					"name" =>	 $column,
					"description" => ( isset($columnInfo) ?
							   $columnInfo[count($result["columns"])]["description"] : $column ),
					"filter" =>	 ( isset($columnInfo) ?
							   $columnInfo[count($result["columns"])]["filter"] : null )
				);
			}
		}

		// the data itself
		$result["keys"] = array();
		$result["data"] = array();
		foreach ($r as $row) {
			// set keys for edit/open and delete
			if (isset($this->underlyingTable)) {
				// for normal tables and VIEWs that have one, the PRIMARY KEY is the key
				if (isset($row[$this->underlyingTable."_".$this->D->T($this->underlyingTable)->priKey])) {
					$result["keys"][] = $row[$this->underlyingTable."_".$this->D->T($this->underlyingTable)->priKey];
				} elseif (isset($row[$this->D->T($this->underlyingTable)->priKey])) {
					$result["keys"][] = $row[$this->D->T($this->underlyingTable)->priKey];
				} else {
					$this->D->error("Malconfigured query: main table assigned, but primary key not in SELECT columns", 500);
				}
			} else {
				// for VIEWs, we just make up a key as an index 
				$result["keys"][] = $skipRows + count($result["keys"]);
			}
			// set data
			$rowData = array();
			foreach ($row as $c => $v) {
				if ( !isset($this->underlyingTable)
				  || ($c != ($this->underlyingTable."_".$this->D->T($this->underlyingTable)->priKey) )
				  || $fullResult ) {	// hide primary key, unless full result requested
					$rowData[] = $v;
				}
			}
			$result["data"][] = $rowData;
		}

		return($result);

	} /* function run() */

	protected function lockFile () {
		$lockfile = ( $this->isPublic ? $this->D->publicQueryDir() : $this->D->userQueryDir() ).'/.'.$this->name.'.lock';
			// filename, depending on whether it's public or private query
		$oldfile = ( $this->isPublic ? $this->D->userQueryDir() : $this->D->publicQueryDir() ).'/.'.$this->name.'.lock';
			// the "inverse" to filename - will be moved, so that changing public/private doesn't loose the lock
		if (is_file($oldfile)) {
			rename($oldfile, $lockfile);
		}
		return($lockfile);
	}

	protected function readLock () {
		if (is_file($this->lockFile())) {
			return(unserialize(file_get_contents($this->lockFile())));
		} else {
			return(false);
		}
	}

	protected function writeLock($lockData = null) {
		if (isset($lockData)) {
			file_put_contents($this->lockFile(), serialize($lockData));
		} elseif (is_file($this->lockFile())) {
			unlink($this->lockFile());
		} 
	}

	/********************************************************/
	/* public functions - called by the UI or other classes */
	/********************************************************/

	public function getInfo () {
		/* return information needed by the UI to setup corresponding JavaScript class */
		return( array(	"name" =>		$this->name,
				"description" =>	$this->description,
				"section" =>		"query",
				"userQuery" =>		$this->isUserQuery,
				"saveQuery" =>		$this->saveQuery,
				"isPublic" =>		$this->isPublic,
				"priKey" =>		$this->priKey,
				"searchable" =>		$this->searchable,
				"underlyingTable" =>	$this->underlyingTable,
				"templates" =>		$this->Templates,
				"allowNew" =>		$this->allowNew,
				"allowEdit" =>		$this->allowEdit,
				"allowDelete" =>	$this->allowDelete,
				"sql" =>		$this->sqlQuery
		) );
	}

	public function lock () {
		$readLock = $this->readLock();
		if ($readLock && (time() < ($readLock['since']+$this->D->conf('locktime'))) ) {
			$this->D->error("Cannot lock query, already locked by ".$readLock['by']." until ".$readLock['until'], 403);
		} else {
			$this->writeLock(array(	'since' =>	time(),
						'hash' =>	md5(microtime().$this->D->loggedUser()),
						'by' =>		$this->D->loggedUser(),
						'until' =>	date(DATE_RFC822, (time() + $this->D->conf('locktime'))) ) );
			$this->D->log("Created lock until ".$this->readLock()['until']);
			return($this->readLock());
		}
	}

	public function unlock ($Id, $options) {
		$readLock = $this->readLock();
		if ( $readLock == false) {
			$this->D->log("Query was not locked.");
			return;
		} elseif ($readLock && isset($options['hash']) && ( $readLock['hash'] == $options['hash'] ) ) {
			$this->D->log("Removed lock ".$readLock['hash'].", was valid until ".$readLock['until']);
			$this->writeLock();
			return;
		} else {
			$this->D->error("Cannot unlock query, incorrect hash. Locked by ".$readLock['by']." until ".$readLock['until'], 403);
		}
	}

	public function modify ($Id, $queryConf) {
		$readLock = $this->readLock();
		if ($readLock == false) {
			$this->D->error("Cannot save query, since it has not been locked.", 403);
		}
		if ($queryConf['hash'] != $readLock['hash']) {
			$this->D->error("Cannot save query, locked by ".$readLock['by']." until ".$readLock['until'].". Maybe your lock expired and another user locked it in between.", 403);
		}
		// to modify, we re-run the constructor (this will also update mtime)
		$this->__construct($this->D, $queryConf);
		// save modification, if needed
		$this->save();
		// return updated query info
		return($this->getInfo());
	}

	public function save () {
	// save query to file
		$filename = ( $this->isPublic ? $this->D->publicQueryDir() : $this->D->userQueryDir() ).'/'.$this->name;
			// filename, depending on whether it's public or private query
		$oldfile = ( $this->isPublic ? $this->D->userQueryDir() : $this->D->publicQueryDir() ).'/'.$this->name;
			// the "inverse" to filename - will be deleted, so that changing public/private doesn't duplicate query
		if ($this->saveQuery) {
			$this->D->log("[QUERY] saved to ".$filename);
			file_put_contents($filename, serialize($this->getInfo()));
		} elseif (is_file($filename)) {
			$this->D->log("[QUERY] deleted ".$filename);
			unlink($filename);
		}
		if (is_file($oldfile)) {
			$this->D->log("[QUERY] deleted ".$oldfile);
			unlink($oldfile);
		}
		$this->lockFile();	// this will fix the lockfile, i.e. move it to right directory if needed
	}

	public function getTable ($Id, $options) {
	// route GET to download or show function
		if (isset($options["download"]) && $options["download"]) {
			return($this->download($options));
		} else {
			return($this->show($options));
		}
	}

	public function show ($options) {
	// show the records as a plain table - $options is the query string parameters

		return($this->run($this->prepareQuery($options, false)));

	} // function show()

	public function search ($options) {
	// for global search

		return($this->run($this->prepareQuery($options, true)));

	} // function search()

	public function download ($options) {
	// download data as CSV

		// first, we fetch the data/result
		$result = $this->run($this->prepareQuery($options, true));

		// prepend column names in front of data array
		$columnNames = array();
		foreach ($result["columns"] as $c) {
			$columnNames[] = $c["description"];
		}
		array_unshift($result["data"], $columnNames);

		// return only data
		return($result['data']);
	}

	public function getRecord ($Id, $options) {
	// route GET to download or edit function
		if (isset($options["download"]) && $options["download"]) {
			return($this->downloadOne($Id, $options));
		} else {
			return($this->editRecord($Id, $options));
		}
	}

	/* downloadOne = insert data of one record into OpenDocument Format file */
	public function downloadOne ($Id, $options) {

		if (!isset($Id)) {
			$this->D->error("cannot download single result: key not specified", 400);
		}

		if (isset($options['key']) && $options['key'] != "_count") {
			$skipRows = 0;
			$options['filter'][$this->underlyingTable.'.'.$this->priKey] = $options[$this->priKey];
		} else {
			$options['key'] = "_count";
			$skipRows = $Id;
		}

		$realQuery = $this->prepareQuery($options, true);

		$realQuery['query'] .= "\nLIMIT 1 OFFSET $skipRows";
		$r = $this->D->query($realQuery['query'])->fetch();

		if ($r == false) {		// record not found
			$this->D->error("record not found",404);
		}

		return(array_merge(array($options['key'] => $Id),$r));	// add "PRIMARY KEY" to results
	}

	/* "edit" record function, actually used to view details of one result line */
	public function editRecord ($Id, $options) {

		if (!isset($Id)) {
			$this->D->error("cannot view single result: number not specified", 400);
		}

		$realQuery = $this->prepareQuery($options, true);

		$realQuery['query'] .= "\nLIMIT 1 OFFSET $Id"; // we want one result and skip all preceding ones
		$r = $this->D->query($realQuery['query'])->fetch();

		if ($r == false) {		// record not found
			$this->D->error("record not found", 404);
		}

		/* now we build a fieldset as required by the UI */

		$r = array_merge(array($this->priKey => $Id),$r);	// add "PRIMARY KEY" to results

		$fieldset = array();	// this will hold the form info, to be JSON-encoded
		
		// all column info
		$i = 0;
		foreach ($r as $field => $value) {
			$fieldset[$field]["type"] = "pre";
			if ($field == $this->priKey) {
				$fieldset[$field]["label"] = "#";
			} elseif (isset($realQuery['columns'])) {
				$fieldset[$field]["label"] = $realQuery['columns'][$i]['description'];
				$i++;
			} else {
				$fieldset[$field]["label"] = $field;
			}
			$fieldset[$field]["value"] = $value;
		} // foreach (over all columns)

		return(	array(	"fieldset" =>	$fieldset,
				"related" =>	array() ) );

	} // function editRecord()

}

class Query extends SimpleQuery {

	public $downloadQuery;			// full query for download
	public $countQuery;			// query stub for returning the number of results

	public $displayColumns = array();	// Column objects - display
	public $downloadColumns = array();	// Column objects - download

	public $whereConditions = array();	// always added to WHERE clause
	public $orderBy = null;			// manual ordering (if configured)
	public $groupBy = null;			// GROUP BY clause

	/* real constructor */
	protected function initialise ($queryConf) {
		// $queryConf : properties are description, columns, condition, orderBy

		// build the basic query in several steps.
		// Query will look like:
		//   SELECT ... FROM ... LEFT JOIN ... ( built by D->selectExpr() ) WHERE ($filters AND) AND ( ($likes OR) )

		$displaySelect = array();	// columns as: table.column AS table_column
		$downloadSelect = array();	// columns as table.column AS table_column

		foreach ($queryConf['columns'] as $table => $columns) {
			if (!isset($columns)) {
				// default: defSelect for display and all columns for download
				$displayColumns = $this->D->T($table)->defSelect;
				$downloadColumns = $this->D->T($table)->columnNames();
			} else {
				if (!is_array($columns)) {
					$columns_str = $columns;
					$columns = explode(",",$columns_str);
				}
				$columns = array_unique($columns);	// remove duplicates
				// check if all columns exist, ignore non-existent ones
				$columns_checked = array();
				foreach($columns as $column) {
					if ($this->D->T($table)->C(preg_replace("/^\./", "", $column)) != null) {
						$columns_checked[] = $column;
					} else {
						$this->D->log("column [$column] does not exist in table [$table]", true);
					}
				}
				// columns starting with dot are excluded from display
				$displayColumns = preg_grep("/^[^\.]/", $columns_checked);
				$downloadColumns = preg_replace("/^\./", "", $columns_checked);
			}
			// if we have a PRIMARY KEY set, we use the table as underlyingTable, unless overridden
			if (!isset($this->underlyingTable) && in_array($this->D->T($table)->priKey, $displayColumns)) {
				$this->underlyingTable = $table;
			}
			// build SELECT expressions
			if (count($displayColumns) > 0) {
				$displaySelect[$table] = $displayColumns;
			}
			if (count($downloadColumns) > 0) {
				$downloadSelect[$table] = $downloadColumns;
			}
			// set column names 
			foreach ($downloadColumns as $c) {
				$this->downloadColumns[] = $this->D->T($table)->C($c);
			}
			foreach ($displayColumns as $c) {
				if ( ($c == $this->D->T($table)->defName) && (!isset($this->nameColumn)) ) {
					$this->nameColumn = count($this->displayColumns);
				}
				if ( ($table != $this->underlyingTable) || ($c != $this->D->T($table)->priKey) ) {	
					// the PRIMARY KEY of the underlyingTable is not displayed
					$this->displayColumns[] = $this->D->T($table)->C($c);
				}
			}
		}

		// add config condition
		if (isset($queryConf['condition'])) {
			$this->whereConditions[] = $queryConf['condition'];
		}

		if (isset($queryConf['orderBy'])) {
			$this->orderBy = $queryConf['orderBy'];
		}

		if (isset($queryConf['groupBy'])) {
			$this->groupBy = $queryConf['groupBy'];
		}

		$this->sqlQuery = $this->D->selectExpr($displaySelect);
		$this->downloadQuery = $this->D->selectExpr($downloadSelect);
		$this->countQuery = $this->D->selectExpr($downloadSelect, 0, true);
		
		// complex query is always searchable
		$this->searchable = true;

		// the rest of the query will be built and added by run()

	}

	protected function prepareQuery($options, $fullResult = false) {
	// complete and run the query, prepared by Constructor, and return result array

		// the basic query misses the WHERE and ORDER BY clauses, this will be done here
		if ($fullResult) {
			$query = $this->downloadQuery;
			$columns = $this->downloadColumns;
		} else {
			$query = $this->sqlQuery;
			$columns = $this->displayColumns;
		}
		$countQuery = $this->countQuery;


		// 1. build the WHERE clause

		$likes = array();			// OR conditions (e.g. full text search)
		$filters = $this->whereConditions;	// AND conditions (e.g. filters) 

		// here we build WHERE conditions - first with OR
		// check for search word in relevant columns
		if (isset($options['search']) && strlen($options['search']) > 0) {
			foreach ($columns as $c) {
				$likes[] = "( " . ( $c->foreign_key ? 
						$c->T->tableName."_".$c->name.".".$this->D->T($c->foreign_table)->defName :
						$c->T->tableName.".".$c->name ) .
					" LIKE ".$this->D->quote("%".$options['search']."%")." )";
			}
		}

		// now AND conditions/filters
		if (count($likes) > 0) {	// the OR's together form one of the AND's
			$filters[] = "(  ".implode("\n          OR ",$likes)." )";
		}

		if (isset($options['filter'])) {	// additional exact filter
			foreach ($options['filter'] as $fexpr => $fvalue) {
				list($ftable, $fcolumn) = explode(".", $fexpr);
				$C = $this->D->T($ftable)->C($fcolumn);
				$filters[] = "( " . $fexpr . ( $fvalue == "NULL" ? " IS NULL" : " = ".$this->D->quote($fvalue) )." )";
			}
		}

		// now we add a WHERE condition if needed
		if (count($filters) > 0) {
			$where = "\nWHERE     ".implode("\n      AND ",$filters);
			$query .= $where;
			$countQuery .= $where;
		}

		// add GROUP BY
		if (isset($this->groupBy)) {
			$query .= "\nGROUP BY  ".$this->groupBy;
			$countQuery .= "\nGROUP BY  ".$this->groupBy;
		}

		// 2. add ORDER BY

		if (isset($options['order'])) {
			$query .= "\nORDER BY  ".$options['order'];
		} elseif (isset($this->orderBy)) {
			$query .= "\nORDER BY  ".$this->orderBy;
		} elseif (isset($this->underlyingTable)) {
			$query .= "\n".$this->D->T($this->underlyingTable)->defOrder;
		}

		// create column info array
		$columnInfo = array();
		foreach($columns as $c) {
			$columnInfo[] = array(
				'description' => $c->description,
				'filter' => $c->filter()
				);
		}

		return(array(	'query' =>		$query,
				'countQuery' =>		$countQuery,
				'options' =>		$options,
				'fullResult' =>		$fullResult,
				'columns' =>		$columnInfo ));

	} /* function prepareQuery() */

}

?>
