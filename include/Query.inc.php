<?php

class SimpleQuery {

	protected $D;			// UniDB parent object
	
	public $name;			// name
	public $description;		// display name
	public $isUserQuery;		// flag: user (= editable) quer
	public $saveQuery;		// flag: save query?
	public $isPublic;		// flag: public query?
	public $underlyingTable = null;	// set underlying main table (to edit records later on)

	public $sqlQuery;		// the actual query stub (built by constructor, w/o WHERE and ORDER BY)

	public $priKey = "_count";	// frontend needs a PRIMARY KEY to identify records

	public $nameColumn = null;	// index of column that has the row's "name"
					// (defaults to first column if nothing better can be guessed)

	public $allowNew = false;	// permissions to add new records,
	public $allowEdit = false;	// edit records,
	public $allowDelete = false;	// or delete records

	public $searchable = false;	// whether or not Query is searchablea

	public $Templates = array();	// Templates used for this query

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

		// copy template definitions
		/*if (isset($queryConf['templates'])) {
			$loadTemplates = $queryConf['templates'];
		} else*/if (isset($this->underlyingTable)) {
			$loadTemplates = $this->D->conf('templates', $this->underlyingTable);
		}
		if (isset($loadTemplates) && is_array($loadTemplates)) {
			foreach ($loadTemplates as $template) {
				if (isset($this->D->Templates[$template])) {
					$this->D->log("+ $template");	
					$this->Templates[$template] = $this->D->Templates[$template];
				} else {
					$this->D->log("Warning: template '$template' is not defined");	
				}
			}
		}
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
			$this->D->log("Forbidden query: '".$query."' does not start with SELECT.", true);
		}
	}

	protected function prepareQuery ($options, $fullResult) {
		// prepareQuery() : prepares the actual query to be run, depending on the options submitted
		//                  > used by run() and editRecord()

		// initialise
		$query = $this->sqlQuery;
		$filterInfo = "";

		// insert search conditions, if search term given
		if (isset($options['search']) && (strlen($options['search']) > 0) && $this->searchable) {
			$query = preg_replace(array('/\/\*+/','/\*+\//'), '', $query);
			$query = preg_replace('/\%s/', $options['search'], $query);
			$filterInfo = " (matching '".$options['search']."')";
		} elseif ($this->searchable) {
			$query = preg_replace('/\/\*+.*?\*+\//', '', $query);
		} elseif (isset($options['search']) && (strlen($options['search']) > 0)) {
			$this->D->log("[warning] search term on non-searchable query - will have no effect.");
		}

		if (isset($options['order'])) {	// ordering chosen in UI
			$query = preg_replace('/\s+ORDER\s+BY\s+.*$/is', '', $query);	// remove ORDER BY if exist
			$query .= "\nORDER BY ".$options['order'];			// add new ORDER BY clause
		}

		return(array(	'query' =>		$query,
				'options' =>		$options,
				'fullResult' =>		$fullResult,
				'filterInfo' =>		$filterInfo,
				'countQuery' =>		null,
				'columnNames' =>	null ));
	}

	protected function run ($argument) {
		/* the function actually executing the query, as prepared by prepareQuery() */
		$query = $argument['query'];
		$countQuery = $argument['countQuery'];
		$columnNames = $argument['columnNames'];
		$options = $argument['options'];
		$fullResult = $argument['fullResult'];

		$result = array();
		$result['filterInfo'] = $argument['filterInfo'];
		$result['nameColumn'] = $this->nameColumn;

		if ($fullResult) {	// full result = skip no rows, and no need to determine total rows before
			$skipRows = 0;
		} else {		// view mode = check total results (provided in UI) and set rows to skip
			if (isset($countQuery)) {	// if we have a countQuery, we can just run it ...
				$totalRows = $this->D->dbh->queryOne($countQuery);
			} else {			// ... otherwise we need to run the whole query, without LIMIT
				$r = $this->D->dbh->query($query);
				if (PEAR::isError($r)) {
					$this->D->log($r->getMessage()."\n\n".$r->getUserinfo(),true);
				} else {
					$totalRows = $r->numRows();
				}
			}
			$skipRows = isset($options['skip']) ? $options['skip'] : 0;
			$this->D->dbh->setLimit($this->D->conf("pageresults"), $skipRows);
		}

		// now, run the main query
		$r = $this->D->dbh->query($query);
		
		if (PEAR::isError($r)) {
			$this->D->log($r->getMessage()."\n\n".$r->getUserinfo(),true);
		}

		$this->D->log("\n".$this->D->dbh->last_query." // returned ".$r->numRows()." rows");

		// now the real result - first metadata and navigation
		if (! $fullResult) {
			// data needed for navigation, if we don't fetch full result
			$result["pageUp"] = ($skipRows - $this->D->conf("pageresults") >= 0
						? $skipRows - $this->D->conf("pageresults") : 0 );
			$result["firstRecord"] = $skipRows + 1;
			$result["lastRecord"] = $skipRows + $r->numRows();
			$result["totalRecords"] = $totalRows;
			$result["pageDown"] = ($skipRows + $this->D->conf("pageresults") < $totalRows
						? $skipRows + $this->D->conf("pageresults") : $skipRows );
			$result["lastPage"] = ($totalRows - $this->D->conf("pageresults") >= 0
						? $totalRows - $this->D->conf("pageresults") : 0);
		}

		$result["columns"] = array();
		foreach (array_keys($r->getColumnNames()) as $column) {
			if ( !isset($this->underlyingTable)
			  || ($column !=  strtolower($this->underlyingTable."_".$this->D->T($this->underlyingTable)->priKey) )
			  || $fullResult ) {	// skip primary key, unless full result requested
				$result["columns"][] = array(	"name" =>	$column,
								"description" =>
							( isset($columnNames) ? $columnNames[count($result["columns"])] : $column ) );
			}
		}

		// the data itself
		$result["keys"] = array();
		$result["data"] = array();
		while ($row = $r->fetchRow()) {
			// set keys for edit/open and delete
			if (isset($this->underlyingTable)) {
				// for normal tables and VIEWs that have one, the PRIMARY KEY is the key
				$result["keys"][] = 
					isset($row[strtolower($this->underlyingTable."_".$this->D->T($this->underlyingTable)->priKey)]) ?
					$row[strtolower($this->underlyingTable."_".$this->D->T($this->underlyingTable)->priKey)] :
					$row[strtolower($this->D->T($this->underlyingTable)->priKey)];
			} else {
				// for VIEWs, we just make up a key as an index 
				$result["keys"][] = $skipRows + count($result["keys"]);
			}
			// set data
			$rowData = array();
			foreach ($row as $c => $v) {
				if ( !isset($this->underlyingTable)
				  || ($c !=  strtolower($this->underlyingTable."_".$this->D->T($this->underlyingTable)->priKey) )
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
			$this->D->log("Cannot lock query, already locked by ".$readLock['by']." until ".$readLock['until'], true);
		} else {
			$this->writeLock(array(	'since' =>	time(),
						'hash' =>	md5(microtime().$this->D->loggedUser()),
						'by' =>		$this->D->loggedUser(),
						'until' =>	date(DATE_RFC822, (time() + $this->D->conf('locktime'))) ) );
			$this->D->log("Created lock until ".$this->readLock()['until']);
			return($this->readLock());
		}
	}

	public function unlock ($options) {
		$readLock = $this->readLock();
		if ( $readLock == false) {
			$this->D->log("Query was not locked.");
			return(true);
		} elseif ($readLock && isset($options['hash']) && ( $readLock['hash'] == $options['hash'] ) ) {
			$this->D->log("Removed lock ".$readLock['hash'].", was valid until ".$readLock['until']);
			$this->writeLock();
			return(true);
		} else {
			$this->D->log("Cannot unlock query, incorrect hash. Locked by ".$readLock['by']." until ".$readLock['until'], true);
		}
	}

	public function modify ($queryConf) {
		$readLock = $this->readLock();
		if ($readLock == false) {
			$this->D->log("Cannot save query, since it has not been locked.", true);
		}
		if ($queryConf['hash'] != $readLock['hash']) {
			$this->D->log("Cannot save query, locked by ".$readLock['by']." until ".$readLock['until'].". Maybe your lock expired and another user locked it in between.", true);
		}
		// to modify, we re-run the constructor
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
		header("Content-type: text/csv");
		header("Content-disposition: attachment; filename=".$this->description.".csv");

		// first, we fetch the data/result
		$result = $this->run($this->prepareQuery($options, true));

		$out = fopen('php://output', 'w');	// we need stdout as a filehandle...
		$columnNames = array();
		foreach ($result["columns"] as $c) {
			$columnNames[] = $c["description"];
		}
		fputcsv($out, $columnNames);
		foreach ($result["data"] as $d) {
			fputcsv($out, $d);
		}
		fclose($out);

		return(null);
	}

	/* downloadOne = insert data of one record into OpenDocument Format file */
	public function downloadOne ($options) {

		//header("Content-disposition: attachment; filename=".$this->description.".csv");

		if (isset($options[$this->priKey])) {
			if ($this->priKey == '_count') {
				$skipRows = $options[$this->priKey];
			} else {
				$skipRows = 0;
				$options['filterTable'] = $this->underlyingTable;
				$options['filterColumn'] = $this->priKey;
				$options['filterValue'] = $options[$this->priKey];
			}
		} else {
			$this->D->log("cannot download single result: key not specified",true);
		}

		$realQuery = $this->prepareQuery($options, true);

		$this->D->dbh->setLimit(1, $skipRows);
		$r = $this->D->dbh->queryRow($realQuery['query']);

		if (PEAR::isError($r)) {
			$this->D->log($r->getMessage()."\n\n".$r->getUserinfo(),true);
		}
		if (!isset($r)) {		// record not found
			$this->D->log("record not found",true);
		}

		$r = array_merge(array($this->priKey => $options[$this->priKey]),$r);	// add "PRIMARY KEY" to results

		$this->D->resultToOdt($options, $r);
	}

	/* "edit" record function, actually used to view details of one result line */
	public function editRecord ($options) {

		if (isset($options[$this->priKey])) {
			$skipRows = $options[$this->priKey];
		} else {
			$this->D->log("cannot view single result: number not specified",true);
		}

		$realQuery = $this->prepareQuery($options, true);

		$this->D->dbh->setLimit(1, $skipRows);	// we want one result and skip all preceding ones
		$r = $this->D->dbh->queryRow($realQuery['query']);

		if (PEAR::isError($r)) {
			$this->D->log($r->getMessage()."\n\n".$r->getUserinfo(),true);
		}
		if (!isset($r)) {		// record not found
			$this->D->log("record not found",true);
		}

		/* now we build a fieldset as required by the UI */

		$r = array_merge(array($this->priKey => $options[$this->priKey]),$r);	// add "PRIMARY KEY" to results

		$fieldset = array();	// this will hold the form info, to be JSON-encoded
		
		// all column info
		$i = 0;
		foreach ($r as $field => $value) {
			$fieldset[$field]["type"] = "pre";
			if ($field == $this->priKey) {
				$fieldset[$field]["label"] = "#";
			} elseif (isset($realQuery['columnNames'])) {
				$fieldset[$field]["label"] = $realQuery['columnNames'][$i];
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

	//public $displayColumns = array();	// Column objects - display
	public $displayColumnNames = array();	// column headings - display
	public $downloadColumnNames = array();	// column headings - download
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
				// columns starting with dot are excluded from display
				$displayColumns = preg_grep("/^[^\.]/", $columns);
				$downloadColumns = preg_replace("/^\./", "", $columns);
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
				$this->downloadColumnNames[] = $this->D->T($table)->C($c)->description;
			}
			foreach ($displayColumns as $c) {
				if ( ($c == $this->D->T($table)->defName) && (!isset($this->nameColumn)) ) {
					$this->nameColumn = count($this->displayColumnNames);
				}
				if ( ($table != $this->underlyingTable) || ($c != $this->D->T($table)->priKey) ) {	
					// the PRIMARY KEY of the underlyingTable is not displayed
					$this->displayColumnNames[] = $this->D->T($table)->C($c)->description;
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
		} else {
			$query = $this->sqlQuery;
		}
		$countQuery = $this->countQuery;


		// 1. build the WHERE clause

		$likes = array();			// OR conditions (e.g. full text search)
		$filters = $this->whereConditions;	// AND conditions (e.g. filters) 

		$filterInfo = "";			// text info on filters applied

		// here we build WHERE conditions - first with OR
		// check for search word in relevant columns
		if (isset($options['search']) && strlen($options['search']) > 0) {
			$filterInfo .= " (matching '".$options['search']."')";
			foreach ($this->downloadColumns as $c) {
				$likes[] = "( " . ( $c->foreign_key ? 
						$c->T->tableName."_".$c->name.".".$this->D->T($c->foreign_table)->defName :
						$c->T->tableName.".".$c->name ) .
					" LIKE ".$this->D->dbh->quote("%".$options['search']."%")." )";
			}
		}

		// now AND conditions/filters
		if (count($likes) > 0) {	// the OR's together form one of the AND's
			$filters[] = "(  ".implode("\n          OR ",$likes)." )";
		}

		if (isset($options['filterColumn'])) {	// additional exact filter
			$C = $this->D->T($options['filterTable'])->C($options['filterColumn']);
			if (isset($C->foreign_key)) {
				$filterInfo .= " (for ".$this->D->dbh->queryOne("SELECT ".$this->D->T($C->foreign_table)->defName." FROM ".
				$C->foreign_table." WHERE ".$C->foreign_key. " = ".$this->D->dbh->quote($options['filterValue'])).")";
			} else {
				$filterInfo .= " (".$options['filterColumn']."=".$options['filterValue'].")";
			}
			$filters[] = "( ".$options['filterTable'].".".$options['filterColumn']." = ".$this->D->dbh->quote($options['filterValue'])." )";
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

		return(array(	'query' =>		$query,
				'countQuery' =>		$countQuery,
				'options' =>		$options,
				'fullResult' =>		$fullResult,
				'filterInfo' =>		$filterInfo,
				'columnNames' =>	( $fullResult ? $this->downloadColumnNames : $this->displayColumnNames ) ));

	} /* function prepareQuery() */

}

?>
