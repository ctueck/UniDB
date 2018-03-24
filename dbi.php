<?php

ini_set("display_errors","stdout");

require 'config/config.inc.php';

require 'include/UniDB.php';

/*** resume or create session ***/

session_start();

if (isset($_GET['logout'])) {			// logout
	unset($_SESSION['UniDB']);
}

if (isset($_SESSION['UniDB']) ) {		// existing session

	$_SESSION['UniDB']->execCmd();				// -> simply run command;

} elseif (isset($_POST['login'])) {	// login

	// initialise new UniDB object
	$_SESSION['UniDB'] = new UniDB($UniDB_config, $_POST['username'], $_POST['password']);
	
	// if login was incorrect we should not get to here (error in DB connect would be fatal)
	
	// return the "message of the day"
	header("Content-type: application/json");
	echo(json_encode(array("UniDB_motd" => $_SESSION['UniDB']->connectInfo())));

} else {

	// tell that user needs to log in
	header("Content-type: application/json");
	die(json_encode(array(	"UniDB_requestLogin" =>	1 )));

}


?>
